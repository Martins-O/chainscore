// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ChainScore ScoreEngine
/// @notice Oracle-fed credit score storage. Returns LTV percentage for each agent.
///         Scores range from 300 to 850. New agents default to 350.
contract ScoreEngine is Ownable {
    // --- Constants ---

    /// @notice Minimum possible credit score
    uint16 public constant MIN_SCORE = 300;

    /// @notice Maximum possible credit score
    uint16 public constant MAX_SCORE = 850;

    /// @notice Cooldown period between score updates (24 hours)
    uint256 public constant UPDATE_COOLDOWN = 24 hours;

    /// @notice Number of historical score snapshots stored per agent
    uint256 public constant HISTORY_LENGTH = 10;

    // --- Structs ---

    /// @notice Current score data for an agent
    struct ScoreData {
        uint16 score;
        uint256 updatedAt;
        bytes32 dataHash;
    }

    /// @notice A historical score snapshot
    struct ScoreSnapshot {
        uint16 score;
        uint256 timestamp;
    }

    // --- State ---

    /// @notice Mapping of authorized oracle addresses
    mapping(address => bool) public oracles;

    /// @notice Current score data per agentId
    mapping(uint256 => ScoreData) private _scores;

    /// @notice Circular buffer of historical score snapshots per agentId
    mapping(uint256 => ScoreSnapshot[HISTORY_LENGTH]) private _scoreHistory;

    /// @notice Total number of updates per agentId (used for circular buffer index)
    mapping(uint256 => uint256) private _historyCount;

    // --- Events ---

    /// @notice Emitted when an agent's score is updated
    event ScoreUpdated(
        uint256 indexed agentId,
        uint16 oldScore,
        uint16 newScore,
        bytes32 dataHash,
        uint256 timestamp
    );

    /// @notice Emitted when an oracle address is added
    event OracleAdded(address indexed oracle);

    /// @notice Emitted when an oracle address is removed
    event OracleRemoved(address indexed oracle);

    // --- Errors ---

    /// @notice Caller is not an authorized oracle
    error NotOracle();

    /// @notice Cooldown period has not elapsed since last update
    error CooldownActive(uint256 nextUpdateAt);

    /// @notice Score is outside the valid range [300, 850]
    error InvalidScore(uint16 score);

    /// @notice Agent has not been registered
    error AgentNotRegistered();

    // --- Constructor ---

    /// @notice Deploys ScoreEngine with an initial owner
    /// @param initialOwner Address that receives contract ownership
    constructor(address initialOwner) Ownable(initialOwner) {}

    // --- Oracle Management ---

    /// @notice Adds an address to the oracle whitelist
    /// @param oracle Address to authorize as an oracle
    function addOracle(address oracle) external onlyOwner {
        oracles[oracle] = true;
        emit OracleAdded(oracle);
    }

    /// @notice Removes an address from the oracle whitelist
    /// @param oracle Address to deauthorize
    function removeOracle(address oracle) external onlyOwner {
        oracles[oracle] = false;
        emit OracleRemoved(oracle);
    }

    // --- Score Updates ---

    /// @notice Updates the credit score for an agent
    /// @dev Reverts if caller is not an oracle, score is out of range, or cooldown is active.
    ///      First update for an agent bypasses cooldown and emits oldScore as 350 (default).
    /// @param agentId The agent's identity token ID
    /// @param score The new credit score (300–850)
    /// @param dataHash keccak256(abi.encode(rawInputs)) for auditability
    function updateScore(uint256 agentId, uint16 score, bytes32 dataHash) external {
        if (!oracles[msg.sender]) {
            revert NotOracle();
        }
        if (score < MIN_SCORE || score > MAX_SCORE) {
            revert InvalidScore(score);
        }

        ScoreData storage data = _scores[agentId];

        if (data.updatedAt > 0) {
            uint256 nextUpdateAt = data.updatedAt + UPDATE_COOLDOWN;
            if (block.timestamp < nextUpdateAt) {
                revert CooldownActive(nextUpdateAt);
            }
        }

        uint16 oldScore = data.updatedAt == 0 ? 350 : data.score;

        data.score = score;
        data.updatedAt = block.timestamp;
        data.dataHash = dataHash;

        uint256 idx = _historyCount[agentId] % HISTORY_LENGTH;
        _scoreHistory[agentId][idx] = ScoreSnapshot(score, block.timestamp);
        _historyCount[agentId]++;

        emit ScoreUpdated(agentId, oldScore, score, dataHash, block.timestamp);
    }

    // --- View Functions ---

    /// @notice Returns the current score and last update time for an agent
    /// @dev Returns (350, 0) for agents that have never been updated
    /// @param agentId The agent's identity token ID
    /// @return score The current credit score (300–850, or 350 default)
    /// @return updatedAt Timestamp of the last update (0 if never updated)
    function getScore(uint256 agentId) external view returns (uint16 score, uint256 updatedAt) {
        ScoreData storage data = _scores[agentId];
        if (data.updatedAt == 0) {
            return (350, 0);
        }
        return (data.score, data.updatedAt);
    }

    /// @notice Returns the LTV percentage for an agent based on their credit score
    /// @dev Score bands: 300–499→50%, 500–599→60%, 600–699→70%, 700–799→78%, 800–850→85%
    /// @param agentId The agent's identity token ID
    /// @return ltv The loan-to-value percentage (e.g. 50 means 50%)
    function getLTV(uint256 agentId) external view returns (uint256 ltv) {
        (uint16 score, ) = this.getScore(agentId);
        if (score >= 800) return 85;
        if (score >= 700) return 78;
        if (score >= 600) return 70;
        if (score >= 500) return 60;
        return 50;
    }

    /// @notice Returns the score history for an agent (last 10 entries)
    /// @param agentId The agent's identity token ID
    /// @return Array of ScoreSnapshot structs in chronological order (oldest first)
    function getScoreHistory(uint256 agentId) external view returns (ScoreSnapshot[] memory) {
        uint256 count = _historyCount[agentId];
        uint256 len = count < HISTORY_LENGTH ? count : HISTORY_LENGTH;

        ScoreSnapshot[] memory history = new ScoreSnapshot[](len);

        if (count <= HISTORY_LENGTH) {
            for (uint256 i = 0; i < len; i++) {
                history[i] = _scoreHistory[agentId][i];
            }
        } else {
            uint256 start = count % HISTORY_LENGTH;
            for (uint256 i = 0; i < HISTORY_LENGTH; i++) {
                history[i] = _scoreHistory[agentId][(start + i) % HISTORY_LENGTH];
            }
        }

        return history;
    }
}
