// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IAgentID {
    function tokenOfOwner(address owner) external view returns (uint256);
}

interface IScoreEngine {
    function getLTV(uint256 agentId) external view returns (uint256);
}

interface IPriceOracle {
    /// @notice Returns the price in USD with 18 decimals
    function getPrice(address token) external view returns (uint256);
}

/// @title ChainScore LendingVault
/// @notice USDC lending pool with score-gated LTV. Borrowers deposit tokenized stock
///         collateral and borrow USDC. Lenders deposit USDC for vault shares.
contract LendingVault is Ownable, ReentrancyGuard, ERC20 {
    using SafeERC20 for IERC20;

    // --- Constants ---

    /// @notice Interest rate in basis points (800 = 8% APR)
    uint256 public constant INTEREST_RATE_BPS = 800;

    /// @notice Basis points denominator (100% = 10000)
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Seconds in a year for interest calculation
    uint256 public constant YEAR = 365 days;

    /// @notice Liquidation threshold: health factor below this triggers liquidation
    uint256 public constant LIQUIDATION_THRESHOLD = 110;

    // --- Immutables ---

    /// @notice USDC token address
    address public immutable usdc;

    /// @notice ScoreEngine contract address
    address public immutable scoreEngine;

    /// @notice AgentID contract address
    address public immutable agentId;

    /// @notice Price oracle contract address
    address public immutable priceOracle;

    // --- Loan state ---

    /// @notice Represents an active loan
    struct Loan {
        /// @notice Agent ID of the borrower
        uint256 agentId;
        /// @notice Borrower address
        address borrower;
        /// @notice Collateral token address
        address collateralToken;
        /// @notice Amount of collateral tokens locked
        uint256 collateralAmount;
        /// @notice Outstanding principal in USDC (6 decimals)
        uint256 principal;
        /// @notice Accrued but unpaid interest in USDC (6 decimals)
        uint256 interestAccrued;
        /// @notice Timestamp of the last interest accrual update
        uint256 lastUpdateTime;
        /// @notice Whether the loan is active (not closed or liquidated)
        bool active;
    }

    /// @notice All loans by loanId
    mapping(uint256 => Loan) private _loans;

    /// @notice Next available loan ID
    uint256 private _nextLoanId = 1;

    /// @notice Whitelisted collateral tokens
    mapping(address => bool) public whitelistedCollateral;

    // --- Events ---

    /// @notice Emitted when a lender deposits USDC
    event Deposited(address indexed lender, uint256 amount, uint256 shares);

    /// @notice Emitted when a lender withdraws USDC
    event Withdrawn(address indexed lender, uint256 shares, uint256 amount);

    /// @notice Emitted when a borrower takes out a loan
    event Borrowed(
        uint256 indexed loanId,
        uint256 indexed agentId,
        address collateral,
        uint256 collateralAmt,
        uint256 borrowAmt
    );

    /// @notice Emitted when a loan is repaid (partial or full)
    event Repaid(uint256 indexed loanId, uint256 amount, uint256 remaining);

    /// @notice Emitted when a loan is liquidated
    event Liquidated(
        uint256 indexed loanId,
        address indexed liquidator,
        uint256 collateralSeized
    );

    // --- Errors ---

    /// @notice Borrower does not have an AgentID
    error NoAgentIdentity();

    /// @notice Borrow amount exceeds the maximum allowed by LTV
    error ExceedsMaxLTV(uint256 requested, uint256 maxAllowed);

    /// @notice Vault does not have enough USDC liquidity
    error InsufficientLiquidity();

    /// @notice Loan is not liquidatable (health factor is at or above threshold)
    error LoanNotLiquidatable(uint256 healthFactor);

    /// @notice Collateral token is not whitelisted
    error CollateralNotWhitelisted();

    /// @notice Loan not found or already closed
    error LoanNotFound();

    // --- Constructor ---

    /// @notice Deploys LendingVault
    /// @param _usdc USDC token address
    /// @param _scoreEngine ScoreEngine contract address
    /// @param _agentId AgentID contract address
    /// @param _priceOracle Price oracle contract address
    constructor(
        address _usdc,
        address _scoreEngine,
        address _agentId,
        address _priceOracle
    ) Ownable(msg.sender) ERC20("ChainScore Vault Shares", "cvaUSDC") {
        usdc = _usdc;
        scoreEngine = _scoreEngine;
        agentId = _agentId;
        priceOracle = _priceOracle;
    }

    // --- Admin ---

    /// @notice Adds a token to the collateral whitelist
    /// @param token Collateral token address
    /// @dev Only callable by contract owner
    function addCollateralToken(address token) external onlyOwner {
        whitelistedCollateral[token] = true;
    }

    // --- Lender Functions ---

    /// @notice Deposits USDC into the vault and mints vault shares
    /// @param usdcAmount Amount of USDC to deposit (6 decimals)
    function deposit(uint256 usdcAmount) external nonReentrant {
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), usdcAmount);
        _mint(msg.sender, usdcAmount);
        emit Deposited(msg.sender, usdcAmount, usdcAmount);
    }

    /// @notice Redeems vault shares for USDC
    /// @param shares Amount of shares to redeem
    function withdraw(uint256 shares) external nonReentrant {
        _burn(msg.sender, shares);
        IERC20(usdc).safeTransfer(msg.sender, shares);
        emit Withdrawn(msg.sender, shares, shares);
    }

    // --- Borrower Functions ---

    /// @notice Borrows USDC against tokenized stock collateral
    /// @dev Caller must have a valid AgentID. Collateral must be whitelisted.
    /// @param agentId_ The borrower's AgentID token ID
    /// @param collateralToken Address of the collateral token (e.g. TSLA, AMZN)
    /// @param collateralAmt Amount of collateral to lock
    /// @param borrowAmt Amount of USDC to borrow (6 decimals)
    /// @return loanId The ID of the newly created loan
    function borrow(
        uint256 agentId_,
        address collateralToken,
        uint256 collateralAmt,
        uint256 borrowAmt
    ) external nonReentrant returns (uint256 loanId) {
        if (IAgentID(agentId).tokenOfOwner(msg.sender) == 0) {
            revert NoAgentIdentity();
        }

        if (!whitelistedCollateral[collateralToken]) {
            revert CollateralNotWhitelisted();
        }

        uint256 ltv = IScoreEngine(scoreEngine).getLTV(agentId_);
        uint256 collateralValue = _getCollateralValue(collateralToken, collateralAmt);
        // collateralValue has 18 decimals, but borrowAmt is USDC (6 decimals)
        // Convert maxBorrow to USDC decimals: divide by 10**12
        uint256 maxBorrow = collateralValue * ltv / 100 / 1e12;

        if (borrowAmt > maxBorrow) {
            revert ExceedsMaxLTV(borrowAmt, maxBorrow);
        }

        if (IERC20(usdc).balanceOf(address(this)) < borrowAmt) {
            revert InsufficientLiquidity();
        }

        IERC20(collateralToken).safeTransferFrom(
            msg.sender,
            address(this),
            collateralAmt
        );

        IERC20(usdc).safeTransfer(msg.sender, borrowAmt);

        loanId = _nextLoanId++;
        _loans[loanId] = Loan({
            agentId: agentId_,
            borrower: msg.sender,
            collateralToken: collateralToken,
            collateralAmount: collateralAmt,
            principal: borrowAmt,
            interestAccrued: 0,
            lastUpdateTime: block.timestamp,
            active: true
        });

        emit Borrowed(loanId, agentId_, collateralToken, collateralAmt, borrowAmt);
    }

    /// @notice Repays a loan (partial or full)
    /// @dev Full repayment returns collateral to the borrower. Anyone can repay on behalf of a borrower.
    /// @param loanId The ID of the loan to repay
    /// @param amount Amount of USDC to repay (6 decimals)
    function repay(uint256 loanId, uint256 amount) external nonReentrant {
        Loan storage loan = _loans[loanId];
        if (!loan.active) revert LoanNotFound();

        _accrueInterest(loan);

        uint256 totalOwed = loan.principal + loan.interestAccrued;

        IERC20(usdc).safeTransferFrom(msg.sender, address(this), amount);

        if (amount >= totalOwed) {
            loan.active = false;
            IERC20(loan.collateralToken).safeTransfer(
                loan.borrower,
                loan.collateralAmount
            );
            emit Repaid(loanId, totalOwed, 0);
        } else {
            if (amount <= loan.interestAccrued) {
                loan.interestAccrued -= amount;
            } else {
                uint256 remaining = amount - loan.interestAccrued;
                loan.interestAccrued = 0;
                loan.principal -= remaining;
            }
            uint256 remainingOwed = loan.principal + loan.interestAccrued;
            emit Repaid(loanId, amount, remainingOwed);
        }
    }

    /// @notice Liquidates an unhealthy loan
    /// @dev Liquidator pays the outstanding debt and receives the collateral.
    ///      Anyone can call this on a loan with health factor below 110.
    /// @param loanId The ID of the loan to liquidate
    function liquidate(uint256 loanId) external nonReentrant {
        Loan storage loan = _loans[loanId];
        if (!loan.active) revert LoanNotFound();

        _accrueInterest(loan);

        uint256 healthFactor = _healthFactor(loan);
        if (healthFactor >= LIQUIDATION_THRESHOLD) {
            revert LoanNotLiquidatable(healthFactor);
        }

        uint256 totalOwed = loan.principal + loan.interestAccrued;
        loan.active = false;

        IERC20(usdc).safeTransferFrom(msg.sender, address(this), totalOwed);

        uint256 collateralSeized = loan.collateralAmount;
        IERC20(loan.collateralToken).safeTransfer(msg.sender, collateralSeized);

        emit Liquidated(loanId, msg.sender, collateralSeized);
    }

    // --- View Functions ---

    /// @notice Returns the health factor for a loan
    /// @dev Health factor = (collateralValueUSD * 100) / totalOwed
    ///      Values below 110 mean the loan is liquidatable.
    /// @param loanId The ID of the loan
    /// @return healthFactor The health factor (e.g. 150 means 150%)
    function getHealthFactor(uint256 loanId) external view returns (uint256) {
        Loan storage loan = _loans[loanId];
        if (!loan.active) revert LoanNotFound();
        uint256 loanCopyPrincipal = loan.principal;
        uint256 loanCopyInterest = loan.interestAccrued;
        uint256 loanCopyUpdate = loan.lastUpdateTime;
        uint256 interest = _calculateInterest(
            loanCopyPrincipal,
            loanCopyUpdate
        );
        uint256 totalDebt = loanCopyPrincipal + loanCopyInterest + interest;
        uint256 collateralValue = _getCollateralValue(
            loan.collateralToken,
            loan.collateralAmount
        );
        if (totalDebt == 0) return type(uint256).max;
        return (collateralValue / 1e12) * 100 / totalDebt;
    }

    // --- Internal ---

    function _getCollateralValue(
        address token,
        uint256 amount
    ) internal view returns (uint256) {
        uint256 price = IPriceOracle(priceOracle).getPrice(token);
        uint256 decimals = IERC20Metadata(token).decimals();
        return (amount * price) / (10 ** decimals);
    }

    function _calculateInterest(
        uint256 principal,
        uint256 lastUpdate
    ) internal view returns (uint256) {
        uint256 timeDelta = block.timestamp - lastUpdate;
        return
            (principal * INTEREST_RATE_BPS * timeDelta) /
            YEAR /
            BPS_DENOMINATOR;
    }

    function _accrueInterest(Loan storage loan) internal {
        if (loan.lastUpdateTime >= block.timestamp) return;
        uint256 interest = _calculateInterest(
            loan.principal,
            loan.lastUpdateTime
        );
        loan.interestAccrued += interest;
        loan.lastUpdateTime = block.timestamp;
    }

    function _healthFactor(
        Loan storage loan
    ) internal view returns (uint256) {
        uint256 interest = _calculateInterest(
            loan.principal,
            loan.lastUpdateTime
        );
        uint256 totalDebt = loan.principal + loan.interestAccrued + interest;
        uint256 collateralValue = _getCollateralValue(
            loan.collateralToken,
            loan.collateralAmount
        );
        if (totalDebt == 0) return type(uint256).max;
        // collateralValue has 18 decimals, totalDebt has 6 decimals (USDC)
        // Convert collateralValue to 6 decimals by dividing by 1e12
        return (collateralValue / 1e12) * 100 / totalDebt;
    }
}
