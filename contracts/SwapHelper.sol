// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title SwapHelper
 * @notice Helper contract for Uniswap V3 operations (swap, add/remove liquidity)
 * @dev Implements callbacks required by Uniswap V3 pool
 */
interface IERC20 {
    function transfer(address to, uint256 amount) externar al returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IUniswapV3Pool {
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);

    function mint(
        address recipient,
        uint256 index,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount,
        bytes calldata data
    ) external returns (uint256 amount0, uint256 amount1);

    function burn(
        uint256 index,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount
    ) external returns (uint256 amount0, uint256 amount1);

    function collect(
        address recipient,
        uint256 index,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount0Requested,
        uint128 amount1Requested
    ) external returns (uint128 amount0, uint128 amount1);

    function positions(bytes32 key) external view returns (
        uint128 liquidity,
        uint256 feeGrowthInside0LastX128,
        uint256 feeGrowthInside1LastX128,
        uint128 tokensOwed0,
        uint128 tokensOwed1
    );
}

contract SwapHelper {
    address public immutable owner;
    address public immutable token0; // USDC
    address public immutable token1; // WETH

    event SwapExecuted(address indexed pool, bool zeroForOne, uint256 amountIn);
    event LiquidityAdded(address indexed pool, int24 tickLower, int24 tickUpper, uint128 liquidity);
    event LiquidityRemoved(address indexed pool, int24 tickLower, int24 tickUpper, uint128 liquidity);

    constructor(address _token0, address _token1) {
        owner = msg.sender;
        token0 = _token0;
        token1 = _token1;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /**
     * @notice Execute a swap through Uniswap V3 pool
     */
    function executeSwap(
        address pool,
        address tokenIn,
        address tokenOut,
        bool zeroForOne,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    ) external onlyOwner returns (int256 amount0, int256 amount1) {
        // Transfer tokens from owner to this contract
        require(
            IERC20(tokenIn).transferFrom(owner, address(this), amountIn),
            "Transfer from owner failed"
        );

        // Execute swap - output tokens sent directly to owner
        (amount0, amount1) = IUniswapV3Pool(pool).swap(
            owner,
            zeroForOne,
            int256(amountIn),
            sqrtPriceLimitX96,
            abi.encode(tokenIn, amountIn)
        );

        // Clean up any remaining tokens
        _cleanupTokens(tokenIn, tokenOut);

        emit SwapExecuted(pool, zeroForOne, amountIn);
    }

    /**
     * @notice Add liquidity to Uniswap V3 pool
     */
    function addLiquidity(
        address pool,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidityAmount,
        uint256 amount0Max,
        uint256 amount1Max
    ) external onlyOwner returns (uint256 amount0, uint256 amount1) {
        // Transfer max amounts from owner to this contract
        if (amount0Max > 0) {
            require(
                IERC20(token0).transferFrom(owner, address(this), amount0Max),
                "Transfer token0 failed"
            );
        }
        if (amount1Max > 0) {
            require(
                IERC20(token1).transferFrom(owner, address(this), amount1Max),
                "Transfer token1 failed"
            );
        }

        // Add liquidity - recipient must be this contract for position tracking
        (amount0, amount1) = IUniswapV3Pool(pool).mint(
            address(this), // recipient - position is tracked by this contract
            0, // index
            tickLower,
            tickUpper,
            liquidityAmount,
            abi.encode(amount0Max, amount1Max)
        );

        // Return unused tokens to owner
        _cleanupTokens(token0, token1);

        emit LiquidityAdded(pool, tickLower, tickUpper, liquidityAmount);
    }

    /**
     * @notice Remove liquidity from Uniswap V3 pool
     * @dev If liquidityAmount is 0, removes 100% of the position's liquidity
     */
    function removeLiquidity(
        address pool,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidityAmount
    ) external onlyOwner returns (uint256 amount0, uint256 amount1) {
        // If liquidityAmount is 0, get the full position liquidity
        if (liquidityAmount == 0) {
            bytes32 positionKey = keccak256(abi.encodePacked(address(this), uint256(0), tickLower, tickUpper));
            (uint128 positionLiquidity, , , , ) = IUniswapV3Pool(pool).positions(positionKey);
            require(positionLiquidity > 0, "No liquidity in position");
            liquidityAmount = positionLiquidity;
        }

        // Burn liquidity
        (amount0, amount1) = IUniswapV3Pool(pool).burn(
            0, // index
            tickLower,
            tickUpper,
            liquidityAmount
        );

        // Collect tokens
        IUniswapV3Pool(pool).collect(
            owner, // recipient
            0, // index
            tickLower,
            tickUpper,
            type(uint128).max,
            type(uint128).max
        );

        emit LiquidityRemoved(pool, tickLower, tickUpper, liquidityAmount);
    }

    /**
     * @notice Callback for Uniswap V3 swap
     */
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external {
        require(amount0Delta > 0 || amount1Delta > 0, "Invalid swap callback");

        (address tokenIn, ) = abi.decode(data, (address, uint256));
        uint256 amountToPay = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);

        // Transfer tokens to pool
        require(
            IERC20(tokenIn).transfer(msg.sender, amountToPay),
            "Payment to pool failed"
        );
    }

    /**
     * @notice Callback for Uniswap V3 mint (add liquidity)
     */
    function uniswapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata /* data */
    ) external {
        // Transfer owed tokens to pool
        if (amount0Owed > 0) {
            require(
                IERC20(token0).transfer(msg.sender, amount0Owed),
                "Payment token0 failed"
            );
        }
        if (amount1Owed > 0) {
            require(
                IERC20(token1).transfer(msg.sender, amount1Owed),
                "Payment token1 failed"
            );
        }
    }

    /**
     * @notice Clean up any remaining tokens and send to owner
     */
    function _cleanupTokens(address tokenA, address tokenB) private {
        uint256 balanceA = IERC20(tokenA).balanceOf(address(this));
        if (balanceA > 0) {
            IERC20(tokenA).transfer(owner, balanceA);
        }

        uint256 balanceB = IERC20(tokenB).balanceOf(address(this));
        if (balanceB > 0) {
            IERC20(tokenB).transfer(owner, balanceB);
        }
    }

    /**
     * @notice Emergency withdraw function
     */
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner, amount);
    }

    /**
     * @notice Get token balance
     */
    function getTokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @notice Get liquidity for a position
     */
    function getPositionLiquidity(
        address pool,
        int24 tickLower,
        int24 tickUpper
    ) external view returns (uint128 liquidity) {
        bytes32 positionKey = keccak256(abi.encodePacked(address(this), uint256(0), tickLower, tickUpper));
        (liquidity, , , , ) = IUniswapV3Pool(pool).positions(positionKey);
    }
}

