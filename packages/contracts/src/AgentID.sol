// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ChainScore AgentID
/// @notice Soulbound identity NFT. One per address. Non-transferable.
///         Anchors all scoring data and linked wallets for the protocol.
contract AgentID is ERC721, Ownable {
    /// @notice Maximum number of linked wallets per identity
    uint256 public constant MAX_LINKED_WALLETS = 5;

    uint256 private _nextTokenId;

    /// @notice Whether an address has already minted an identity
    mapping(address => bool) public hasMinted;

    /// @notice Timestamp when each token was created
    mapping(uint256 => uint256) private _createdAt;

    /// @notice Linked wallets for each token
    mapping(uint256 => address[]) private _linkedWallets;

    /// @notice Token ID for each owner address
    mapping(address => uint256) private _tokenOfOwner;

    /// @notice Emitted when a new identity is minted
    event IdentityMinted(uint256 indexed tokenId, address indexed owner, uint256 timestamp);

    /// @notice Emitted when a wallet is linked to an identity
    event WalletRegistered(uint256 indexed tokenId, address indexed wallet);

    /// @notice Emitted when a wallet is unlinked from an identity
    event WalletRevoked(uint256 indexed tokenId, address indexed wallet);

    /// @notice Caller already has an identity
    error AlreadyHasIdentity();

    /// @notice Token transfers are not allowed (soulbound)
    error TransferNotAllowed();

    /// @notice Maximum linked wallets already reached
    error MaxWalletsReached();

    /// @notice The specified wallet is not linked to this identity
    error WalletNotLinked();

    /// @notice Caller does not own an identity token
    error NotTokenOwner();

    /// @notice Deploys AgentID with name "ChainScore AgentID" and symbol "AGENT"
    /// @param initialOwner Address that receives contract ownership
    constructor(address initialOwner) ERC721("ChainScore AgentID", "AGENT") Ownable(initialOwner) {
        _nextTokenId = 1;
    }

    /// @notice Prevents all transfers except minting (soulbound enforcement)
    /// @param to The recipient address
    /// @param tokenId The token ID
    /// @param auth The authorizing address
    /// @return from The address the token is being moved from
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0)) {
            revert TransferNotAllowed();
        }
        return super._update(to, tokenId, auth);
    }

    /// @notice Mints a new identity token for the caller
    /// @dev Reverts if caller already has an identity
    /// @return tokenId The ID of the newly minted token
    function mintIdentity() external returns (uint256 tokenId) {
        if (hasMinted[msg.sender]) {
            revert AlreadyHasIdentity();
        }

        tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);

        hasMinted[msg.sender] = true;
        _createdAt[tokenId] = block.timestamp;
        _tokenOfOwner[msg.sender] = tokenId;

        emit IdentityMinted(tokenId, msg.sender, block.timestamp);
    }

    /// @notice Links a wallet to the caller's identity
    /// @dev Reverts if caller has no identity or max wallets reached
    /// @param wallet Address to link
    function registerWallet(address wallet) external {
        uint256 tokenId = _tokenOfOwner[msg.sender];
        if (tokenId == 0) {
            revert NotTokenOwner();
        }
        if (_linkedWallets[tokenId].length >= MAX_LINKED_WALLETS) {
            revert MaxWalletsReached();
        }
        _linkedWallets[tokenId].push(wallet);
        emit WalletRegistered(tokenId, wallet);
    }

    /// @notice Unlinks a wallet from the caller's identity
    /// @dev Uses swap-and-pop to remove from array. Reverts if wallet not linked.
    /// @param wallet Address to unlink
    function revokeWallet(address wallet) external {
        uint256 tokenId = _tokenOfOwner[msg.sender];
        if (tokenId == 0) {
            revert NotTokenOwner();
        }

        address[] storage wallets = _linkedWallets[tokenId];
        uint256 len = wallets.length;
        bool found = false;

        for (uint256 i = 0; i < len; i++) {
            if (wallets[i] == wallet) {
                wallets[i] = wallets[len - 1];
                wallets.pop();
                found = true;
                break;
            }
        }

        if (!found) {
            revert WalletNotLinked();
        }

        emit WalletRevoked(tokenId, wallet);
    }

    /// @notice Returns the linked wallets for a given identity
    /// @param tokenId The token ID to query
    /// @return Array of linked wallet addresses
    function getLinkedWallets(uint256 tokenId) external view returns (address[] memory) {
        return _linkedWallets[tokenId];
    }

    /// @notice Returns the creation timestamp of a token
    /// @param tokenId The token ID to query
    /// @return timestamp The block timestamp when the token was minted
    function createdAt(uint256 tokenId) external view returns (uint256 timestamp) {
        return _createdAt[tokenId];
    }

    /// @notice Returns the token ID owned by an address
    /// @param owner The address to query
    /// @return tokenId The token ID, or 0 if no identity exists
    function tokenOfOwner(address owner) external view returns (uint256 tokenId) {
        return _tokenOfOwner[owner];
    }

    /// @notice Returns the total number of identity tokens minted
    /// @return The total supply of tokens
    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }
}
