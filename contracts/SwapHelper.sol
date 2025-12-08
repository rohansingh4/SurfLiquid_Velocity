// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title SwapHelper
 * @notice Simple contract to execute Uniswap V3 swaps with callback handling
 * @dev Only the owner can execute swaps. Implements uniswapV3SwapCallback.
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
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
}

contract SwapHelper {
    address public immutable owner;

    event SwapExecuted(
        address indexed pool,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        int256 amount0,
        int256 amount1
    );

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /**
     * @notice Execute a swap through Uniswap V3 pool
     * @param pool The Uniswap V3 pool address
     * @param tokenIn Token being sold
     * @param tokenOut Token being bought
     * @param zeroForOne Direction of swap (true = token0->token1, false = token1->token0)
     * @param amountIn Amount of tokenIn to swap
     * @param sqrtPriceLimitX96 Price limit in sqrtPriceX96 format
     * @return amount0 Amount of token0 (negative = received, positive = sent)
     * @return amount1 Amount of token1 (negative = received, positive = sent)
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

        // Execute swap - output tokens will be sent directly to owner
        (amount0, amount1) = IUniswapV3Pool(pool).swap(
            owner, // recipient - send output tokens directly to owner
            zeroForOne,
            int256(amountIn),
            sqrtPriceLimitX96,
            abi.encode(tokenIn, amountIn)
        );

        // Clean up any remaining tokens (shouldn't happen but safety measure)
        uint256 balanceIn = IERC20(tokenIn).balanceOf(address(this));
        if (balanceIn > 0) {
            IERC20(tokenIn).transfer(owner, balanceIn);
        }

        uint256 balanceOut = IERC20(tokenOut).balanceOf(address(this));
        if (balanceOut > 0) {
            IERC20(tokenOut).transfer(owner, balanceOut);
        }

        emit SwapExecuted(pool, tokenIn, tokenOut, amountIn, amount0, amount1);
    }

    /**
     * @notice Callback function called by Uniswap V3 pool during swap
     * @dev This is where we send the input tokens to the pool
     * @param amount0Delta Amount of token0 (positive = we owe, negative = we receive)
     * @param amount1Delta Amount of token1 (positive = we owe, negative = we receive)
     * @param data Encoded data containing tokenIn and amountIn
     */
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external {
        require(amount0Delta > 0 || amount1Delta > 0, "Invalid callback: no positive delta");

        // Decode data
        (address tokenIn, ) = abi.decode(data, (address, uint256));

        // Determine amount to pay (positive delta means we owe tokens to pool)
        uint256 amountToPay = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);

        // Transfer tokens to pool (msg.sender is the pool calling us back)
        require(
            IERC20(tokenIn).transfer(msg.sender, amountToPay),
            "Payment to pool failed"
        );
    }

    /**
     * @notice Emergency function to withdraw any stuck tokens
     * @param token Token address to withdraw
     * @param amount Amount to withdraw
     */
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner, amount);
    }

    /**
     * @notice Get balance of any token held by this contract
     * @param token Token address to check
     * @return balance Token balance
     */
    function getTokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}
