// SPDX-License-Identifier: MIT
pragma solidity =0.8.22;

/**
 * @title BasePoolHelper - Remix Test Version
 * @notice All-in-one contract for easy Remix testing
 * @dev Deploy this on Base network and test add liquidity, swap, and remove liquidity
 *
 * DEPLOYMENT:
 * 1. Set environment to Injected Provider (MetaMask on Base network)
 * 2. Deploy with pool address: 0xd0b53d9277642d899df5c87a3966a349a798f224
 *
 * BEFORE TESTING:
 * 1. Get WETH: 0x4200000000000000000000000000000000000006
 * 2. Get USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 * 3. Approve both tokens for this contract
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
}

contract BasePoolHelper_RemixTest {
    address public immutable owner;
    address public immutable pool;
    address public immutable WETH;  // Token0
    address public immutable USDC;  // Token1

    // Store last position for easy testing
    int24 public lastTickLower;
    int24 public lastTickUpper;
    uint128 public lastLiquidity;

    event Log(string message, int256 value);
    event LogAddress(string message, address value);
    event LiquidityAdded(int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 amount0, uint256 amount1);
    event LiquidityRemoved(int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 amount0, uint256 amount1);
    event SwapExecuted(address tokenIn, uint256 amountIn, int256 amount0, int256 amount1);

    constructor(address _pool) {
        owner = msg.sender;
        pool = _pool;
        WETH = IUniswapV3Pool(_pool).token0();
        USDC = IUniswapV3Pool(_pool).token1();
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ========== SIMPLE TEST FUNCTIONS ==========

    /**
     * @notice TEST 1: Add liquidity with simple parameters
     * BEFORE CALLING:
     * 1. Approve WETH: ~0.01 WETH
     * 2. Approve USDC: ~30 USDC
     *
     * This will add liquidity around current price
     */
    function test1_addLiquidity() external onlyOwner returns (uint256 amount0, uint256 amount1) {
        // Get current tick
        (, int24 currentTick, , , , , ) = IUniswapV3Pool(pool).slot0();
        int24 tickSpacing = IUniswapV3Pool(pool).tickSpacing();

        // Calculate tick range (±2 tick spacings around current)
        int24 tickLower = (currentTick / tickSpacing - 2) * tickSpacing;
        int24 tickUpper = (currentTick / tickSpacing + 2) * tickSpacing;

        // Small amounts for testing
        uint256 amount0Desired = 5000000000000000; // 0.005 WETH
        uint256 amount1Desired = 15000000; // 15 USDC
        uint128 liquidityAmount = 1000000;

        emit Log("Current tick", currentTick);
        emit Log("Tick lower", tickLower);
        emit Log("Tick upper", tickUpper);

        // Transfer tokens
        require(IERC20(WETH).transferFrom(owner, address(this), amount0Desired), "WETH transfer failed");
        require(IERC20(USDC).transferFrom(owner, address(this), amount1Desired), "USDC transfer failed");

        // Add liquidity
        (amount0, amount1) = IUniswapV3Pool(pool).mint(
            address(this),
            tickLower,
            tickUpper,
            liquidityAmount,
            ""
        );

        // Store position
        lastTickLower = tickLower;
        lastTickUpper = tickUpper;
        lastLiquidity = liquidityAmount;

        // Return unused tokens
        uint256 bal0 = IERC20(WETH).balanceOf(address(this));
        uint256 bal1 = IERC20(USDC).balanceOf(address(this));
        if (bal0 > 0) IERC20(WETH).transfer(owner, bal0);
        if (bal1 > 0) IERC20(USDC).transfer(owner, bal1);

        emit LiquidityAdded(tickLower, tickUpper, liquidityAmount, amount0, amount1);
    }

    /**
     * @notice TEST 2: Swap USDC for WETH
     * BEFORE CALLING:
     * 1. Approve USDC: 10 USDC
     */
    function test2_swapUSDCforWETH() external onlyOwner returns (int256 amount0, int256 amount1) {
        uint256 amountIn = 10000000; // 10 USDC

        require(IERC20(USDC).transferFrom(owner, address(this), amountIn), "USDC transfer failed");

        // Swap USDC (token1) for WETH (token0)
        // zeroForOne = false (we're selling token1 for token0)
        (amount0, amount1) = IUniswapV3Pool(pool).swap(
            owner, // Send WETH directly to owner
            false, // token1 -> token0
            int256(amountIn),
            1461446703485210103287273052203988822378723970342, // Max price
            abi.encode(USDC, amountIn)
        );

        // Clean up
        uint256 bal = IERC20(USDC).balanceOf(address(this));
        if (bal > 0) IERC20(USDC).transfer(owner, bal);

        emit SwapExecuted(USDC, amountIn, amount0, amount1);
    }

    /**
     * @notice TEST 2b: Swap WETH for USDC
     * BEFORE CALLING:
     * 1. Approve WETH: 0.005 WETH
     */
    function test2b_swapWETHforUSDC() external onlyOwner returns (int256 amount0, int256 amount1) {
        uint256 amountIn = 5000000000000000; // 0.005 WETH

        require(IERC20(WETH).transferFrom(owner, address(this), amountIn), "WETH transfer failed");

        // Swap WETH (token0) for USDC (token1)
        // zeroForOne = true (we're selling token0 for token1)
        (amount0, amount1) = IUniswapV3Pool(pool).swap(
            owner, // Send USDC directly to owner
            true, // token0 -> token1
            int256(amountIn),
            4295128739, // Min price
            abi.encode(WETH, amountIn)
        );

        // Clean up
        uint256 bal = IERC20(WETH).balanceOf(address(this));
        if (bal > 0) IERC20(WETH).transfer(owner, bal);

        emit SwapExecuted(WETH, amountIn, amount0, amount1);
    }

    /**
     * @notice TEST 3: Remove liquidity from last position
     * This will remove the liquidity added in test1
     */
    function test3_removeLiquidity() external onlyOwner returns (uint256 amount0, uint256 amount1) {
        require(lastLiquidity > 0, "No position to remove");

        // Burn liquidity
        IUniswapV3Pool(pool).burn(lastTickLower, lastTickUpper, lastLiquidity);

        // Collect tokens
        (uint128 collected0, uint128 collected1) = IUniswapV3Pool(pool).collect(
            owner,
            lastTickLower,
            lastTickUpper,
            type(uint128).max,
            type(uint128).max
        );

        emit LiquidityRemoved(lastTickLower, lastTickUpper, lastLiquidity, collected0, collected1);

        // Reset position
        lastLiquidity = 0;

        return (collected0, collected1);
    }

    // ========== CALLBACKS ==========

    function uniswapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata /* data */
    ) external {
        require(msg.sender == pool, "Not pool");
        if (amount0Owed > 0) IERC20(WETH).transfer(pool, amount0Owed);
        if (amount1Owed > 0) IERC20(USDC).transfer(pool, amount1Owed);
    }

    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external {
        require(msg.sender == pool, "Not pool");
        (address tokenIn, ) = abi.decode(data, (address, uint256));
        uint256 amountToPay = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);
        require(IERC20(tokenIn).transfer(pool, amountToPay), "Payment failed");
    }

    // ========== VIEW FUNCTIONS ==========

    function getPoolInfo() external view returns (
        address _token0,
        address _token1,
        uint24 fee,
        int24 tickSpacing,
        uint160 sqrtPriceX96,
        int24 tick
    ) {
        _token0 = WETH;
        _token1 = USDC;
        fee = IUniswapV3Pool(pool).fee();
        tickSpacing = IUniswapV3Pool(pool).tickSpacing();
        (sqrtPriceX96, tick, , , , , ) = IUniswapV3Pool(pool).slot0();
    }

    function getLastPosition() external view returns (
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity
    ) {
        return (lastTickLower, lastTickUpper, lastLiquidity);
    }

    function getMyBalances() external view returns (
        uint256 wethBalance,
        uint256 usdcBalance
    ) {
        wethBalance = IERC20(WETH).balanceOf(owner);
        usdcBalance = IERC20(USDC).balanceOf(owner);
    }

    function getContractBalances() external view returns (
        uint256 wethBalance,
        uint256 usdcBalance
    ) {
        wethBalance = IERC20(WETH).balanceOf(address(this));
        usdcBalance = IERC20(USDC).balanceOf(address(this));
    }

    // ========== EMERGENCY ==========

    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner, amount);
    }

    function withdrawAll() external onlyOwner {
        uint256 wethBal = IERC20(WETH).balanceOf(address(this));
        uint256 usdcBal = IERC20(USDC).balanceOf(address(this));
        if (wethBal > 0) IERC20(WETH).transfer(owner, wethBal);
        if (usdcBal > 0) IERC20(USDC).transfer(owner, usdcBal);
    }
}
