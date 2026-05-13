// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockUSDC is ERC20 {
    uint8 private _decimals;

    constructor() ERC20("Mock USDC", "USDC") {
        _decimals = 6;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockScoreEngine {
    uint256 private _ltv;

    function setLTV(uint256 ltv) external {
        _ltv = ltv;
    }

    function getLTV(uint256) external view returns (uint256) {
        return _ltv;
    }
}

contract MockPriceOracle {
    uint256 private _price;

    function setPrice(uint256 price) external {
        _price = price;
    }

    function getPrice(address) external view returns (uint256) {
        return _price;
    }
}

contract MockAgentID {
    uint256 private _tokenId;

    function setTokenId(uint256 tokenId) external {
        _tokenId = tokenId;
    }

    function tokenOfOwner(address) external view returns (uint256) {
        return _tokenId;
    }
}
