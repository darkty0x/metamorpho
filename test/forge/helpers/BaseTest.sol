// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {Id, Market, Signature, Authorization, IMorpho} from "@morpho-blue/interfaces/IMorpho.sol";

import {MarketLib} from "@morpho-blue/libraries/MarketLib.sol";
import {SharesMathLib} from "@morpho-blue/libraries/SharesMathLib.sol";
import {FixedPointMathLib, WAD} from "@morpho-blue/libraries/FixedPointMathLib.sol";
import {SafeTransferLib, ERC20} from "@solmate/utils/SafeTransferLib.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {Morpho, AUTHORIZATION_TYPEHASH} from "@morpho-blue/Morpho.sol";
import {ERC20Mock} from "test/forge/mocks/ERC20Mock.sol";
import {OracleMock} from "@morpho-blue/mocks/OracleMock.sol";
import {IrmMock} from "@morpho-blue/mocks/IrmMock.sol";

import "@forge-std/Test.sol";
import "@forge-std/console2.sol";

abstract contract BaseTest is Test {
    using MarketLib for Market;
    using SharesMathLib for uint256;
    using stdStorage for StdStorage;
    using FixedPointMathLib for uint256;
    using SafeTransferLib for ERC20;

    uint256 internal constant MIN_AMOUNT = 1000;
    uint256 internal constant MAX_AMOUNT = 2 ** 64;
    uint256 internal constant ORACLE_PRICE_SCALE = 1e36;

    address internal constant USER = address(0x1234);
    address internal constant SUPPLIER = address(0x5678);
    address internal constant OWNER = address(0xdead);

    Morpho internal morpho;
    IrmMock internal irm;

    function setUp() public virtual {
        morpho = new Morpho(OWNER);

        irm = new IrmMock(morpho);

        vm.prank(OWNER);
        morpho.enableIrm(address(irm));
    }
}
