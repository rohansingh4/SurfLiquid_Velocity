// SPDX-License-Identifier: MIT
pragma solidity =0.8.22;

/**
 * @title BasePoolHelper
 * @notice Helper contract for Base Pool operations: add liquidity, withdraw liquidity, and swap
 * @dev Base Pool: 0xd0b53d9277642d899df5c87a3966a349a798f224
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IUniswapV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    function tickSpacing() external view returns (int24);
    function slot0() external view returns (
        uint160 sqrtPriceX96,
        int24 tick,
        uint16 observationIndex,
        uint16 observationCardinality,
        uint16 observationCardinalityNext,
        uint8 feeProtocol,
        bool unlocked
    );

    function mint(
        address recipient,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount,
        bytes calldata data
    ) external returns (uint256 amount0, uint256 amount1);

    function burn(
        int24 tickLower,
        int24 tickUpper,
        uint128 amount
    ) external returns (uint256 amount0, uint256 amount1);

    function collect(
        address recipient,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount0Requested,
        uint128 amount1Requested
    ) external returns (uint128 amount0, uint128 amount1);

    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);

    function positions(bytes32 key) external view returns (
        uint128 liquidity,
        uint256 feeGrowthInside0LastX128,
        uint256 feeGrowthInside1LastX128,
        uint128 tokensOwed0,
        uint128 tokensOwed1
    );
}

contract BasePoolHelper {
    address public immutable owner;
    address public immutable pool;
    address public immutable token0;
    address public immutable token1;

    struct Position {
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }

    // Store user positions
    mapping(address => Position[]) public userPositions;

    event LiquidityAdded(
        address indexed user,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1
    );

    event LiquidityRemoved(
        address indexed user,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1
    );

    event SwapExecuted(
        address indexed user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        int256 amount0,
        int256 amount1
    );

    constructor(address _pool) {
        owner = msg.sender;
        pool = _pool;
        token0 = IUniswapV3Pool(_pool).token0();
        token1 = IUniswapV3Pool(_pool).token1();
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /**
     * @notice Add liquidity to the pool
     * @param tickLower Lower tick of the position
     * @param tickUpper Upper tick of the position
     * @param amount0Desired Desired amount of token0
     * @param amount1Desired Desired amount of token1
     * @param liquidityAmount Amount of liquidity to add
     */
    function addLiquidity(
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint128 liquidityAmount
    ) external onlyOwner returns (uint256 amount0, uint256 amount1) {
        // Transfer tokens from owner to this contract
        if (amount0Desired > 0) {
            require(
                IERC20(token0).transferFrom(owner, address(this), amount0Desired),
                "Token0 transfer failed"
            );
        }
        if (amount1Desired > 0) {
            require(
                IERC20(token1).transferFrom(owner, address(this), amount1Desired),
                "Token1 transfer failed"
            );
        }

        // Add liquidity
        (amount0, amount1) = IUniswapV3Pool(pool).mint(
            address(this), // recipient (we hold the position)
            tickLower,
            tickUpper,
            liquidityAmount,
            abi.encode(msg.sender) // pass owner address for callback
        );

        // Store position info
        userPositions[owner].push(Position({
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidity: liquidityAmount
        }));

        // Return unused tokens to owner
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        if (balance0 > 0) {
            IERC20(token0).transfer(owner, balance0);
        }

        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        if (balance1 > 0) {
            IERC20(token1).transfer(owner, balance1);
        }

        emit LiquidityAdded(owner, tickLower, tickUpper, liquidityAmount, amount0, amount1);
    }

    /**
     * @notice Remove liquidity from the pool
     * @param tickLower Lower tick of the position
     * @param tickUpper Upper tick of the position
     * @param liquidityAmount Amount of liquidity to remove
     */
    function removeLiquidity(
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidityAmount
    ) external onlyOwner returns (uint256 amount0, uint256 amount1) {
        // Burn the liquidity
        IUniswapV3Pool(pool).burn(
            tickLower,
            tickUpper,
            liquidityAmount
        );

        // Collect the tokens
        (uint128 collected0, uint128 collected1) = IUniswapV3Pool(pool).collect(
            owner, // send directly to owner
            tickLower,
            tickUpper,
            type(uint128).max, // collect all
            type(uint128).max  // collect all
        );

        amount0 = uint256(collected0);
        amount1 = uint256(collected1);

        emit LiquidityRemoved(owner, tickLower, tickUpper, liquidityAmount, amount0, amount1);
    }

    /**
     * @notice Execute a swap through the pool
     * @param tokenIn Token to swap from
     * @param tokenOut Token to swap to
     * @param amountIn Amount to swap
     * @param sqrtPriceLimitX96 Price limit
     */
    function executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    ) external onlyOwner returns (int256 amount0, int256 amount1) {
        require(
            (tokenIn == token0 && tokenOut == token1) ||
            (tokenIn == token1 && tokenOut == token0),
            "Invalid token pair"
        );

        bool zeroForOne = tokenIn == token0;

        // Transfer tokens from owner to this contract
        require(
            IERC20(tokenIn).transferFrom(owner, address(this), amountIn),
            "Transfer from owner failed"
        );

        // Execute swap
        (amount0, amount1) = IUniswapV3Pool(pool).swap(
            owner, // recipient - send output tokens directly to owner
            zeroForOne,
            int256(amountIn),
            sqrtPriceLimitX96,
            abi.encode(tokenIn, amountIn)
        );

        // Clean up any remaining tokens
        uint256 balanceIn = IERC20(tokenIn).balanceOf(address(this));
        if (balanceIn > 0) {
            IERC20(tokenIn).transfer(owner, balanceIn);
        }

        uint256 balanceOut = IERC20(tokenOut).balanceOf(address(this));
        if (balanceOut > 0) {
            IERC20(tokenOut).transfer(owner, balanceOut);
        }

        emit SwapExecuted(owner, tokenIn, tokenOut, amountIn, amount0, amount1);
    }

    /**
     * @notice Uniswap V3 mint callback
     */
    function uniswapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata /* data */
    ) external {
        require(msg.sender == pool, "Not pool");

        // Pay the pool
        if (amount0Owed > 0) {
            IERC20(token0).transfer(pool, amount0Owed);
        }
        if (amount1Owed > 0) {
            IERC20(token1).transfer(pool, amount1Owed);
        }
    }

    /**
     * @notice Uniswap V3 swap callback
     */
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external {
        require(msg.sender == pool, "Not pool");
        require(amount0Delta > 0 || amount1Delta > 0, "Invalid callback");

        // Decode data
        (address tokenIn, ) = abi.decode(data, (address, uint256));

        // Determine amount to pay
        uint256 amountToPay = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);

        // Transfer tokens to pool
        require(
            IERC20(tokenIn).transfer(pool, amountToPay),
            "Payment to pool failed"
        );
    }

    /**
     * @notice Get pool information
     */
    function getPoolInfo() external view returns (
        address _token0,
        address _token1,
        uint24 fee,
        int24 tickSpacing,
        uint160 sqrtPriceX96,
        int24 tick
    ) {
        _token0 = token0;
        _token1 = token1;
        fee = IUniswapV3Pool(pool).fee();
        tickSpacing = IUniswapV3Pool(pool).tickSpacing();
        (sqrtPriceX96, tick, , , , , ) = IUniswapV3Pool(pool).slot0();
    }

    /**
     * @notice Get user position count
     */
    function getUserPositionCount(address user) external view returns (uint256) {
        return userPositions[user].length;
    }

    /**
     * @notice Get user position by index
     */
    function getUserPosition(address user, uint256 index) external view returns (
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity
    ) {
        require(index < userPositions[user].length, "Invalid index");
        Position memory pos = userPositions[user][index];
        return (pos.tickLower, pos.tickUpper, pos.liquidity);
    }

    /**
     * @notice Get position info from pool
     */
    function getPositionInfo(int24 tickLower, int24 tickUpper) external view returns (
        uint128 liquidity,
        uint256 feeGrowthInside0LastX128,
        uint256 feeGrowthInside1LastX128,
        uint128 tokensOwed0,
        uint128 tokensOwed1
    ) {
        bytes32 positionKey = keccak256(abi.encodePacked(address(this), tickLower, tickUpper));
        return IUniswapV3Pool(pool).positions(positionKey);
    }

    /**
     * @notice Emergency function to withdraw any stuck tokens
     */
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner, amount);
    }

    /**
     * @notice Get balance of any token held by this contract
     */
    function getTokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}
