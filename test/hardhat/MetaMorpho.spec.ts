import { AbiCoder, MaxUint256, keccak256, toBigInt } from "ethers";
import hre from "hardhat";
import _range from "lodash/range";
import { ERC20Mock, OracleMock, MetaMorpho, IIrm, IMorpho } from "types";
import { MarketParamsStruct } from "types/@morpho-blue/interfaces/IMorpho";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { setNextBlockTimestamp } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";

// Must use relative import path.
import SpeedJumpIrmArtifact from "../../lib/morpho-blue-irm/out/SpeedJumpIrm.sol/SpeedJumpIrm.json";
import MorphoArtifact from "../../lib/morpho-blue/out/Morpho.sol/Morpho.json";

// Without the division it overflows.
const initBalance = MaxUint256 / 10000000000000000n;
const oraclePriceScale = 1000000000000000000000000000000000000n;
const virtualShares = 100000n;
const virtualAssets = 1n;
const nbMarkets = 5;

const ln2 = 693147180559945309n;
const targetUtilization = 800000000000000000n;
const speedFactor = 277777777777n;
const initialRate = 317097920n;

let seed = 42;
const random = () => {
  seed = (seed * 16807) % 2147483647;

  return (seed - 1) / 2147483646;
};

const identifier = (marketParams: MarketParamsStruct) => {
  const encodedMarket = AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "address", "address", "uint256"],
    Object.values(marketParams),
  );

  return Buffer.from(keccak256(encodedMarket).slice(2), "hex");
};

const logProgress = (name: string, i: number, max: number) => {
  if (i % 10 == 0) console.log("[" + name + "]", Math.floor((100 * i) / max), "%");
};

const randomForwardTimestamp = async () => {
  const block = await hre.ethers.provider.getBlock("latest");
  const elapsed = random() < 1 / 2 ? 0 : (1 + Math.floor(random() * 100)) * 12; // 50% of the time, don't go forward in time.

  await setNextBlockTimestamp(block!.timestamp + elapsed);
};

describe("MetaMorpho", () => {
  let admin: SignerWithAddress;
  let riskManager: SignerWithAddress;
  let allocator: SignerWithAddress;
  let suppliers: SignerWithAddress[];
  let borrowers: SignerWithAddress[];

  let morpho: IMorpho;
  let loan: ERC20Mock;
  let collateral: ERC20Mock;
  let oracle: OracleMock;
  let irm: IIrm;

  let metaMorpho: MetaMorpho;

  let allMarketParams: MarketParamsStruct[];

  beforeEach(async () => {
    const allSigners = await hre.ethers.getSigners();

    const users = allSigners.slice(0, -3);

    [admin, riskManager, allocator] = allSigners.slice(-3);
    suppliers = users.slice(0, users.length / 2);
    borrowers = users.slice(users.length / 2);

    const ERC20MockFactory = await hre.ethers.getContractFactory("ERC20Mock", admin);

    loan = await ERC20MockFactory.deploy("DAI", "DAI");
    collateral = await ERC20MockFactory.deploy("Wrapped BTC", "WBTC");

    const OracleMockFactory = await hre.ethers.getContractFactory("OracleMock", admin);

    oracle = await OracleMockFactory.deploy();

    await oracle.setPrice(oraclePriceScale);

    const MorphoFactory = await hre.ethers.getContractFactory(
      MorphoArtifact.abi,
      MorphoArtifact.bytecode.object,
      admin,
    );

    morpho = (await MorphoFactory.deploy(admin.address)) as IMorpho;

    const morphoAddress = await morpho.getAddress();

    const SpeedJumpIrmFactory = await hre.ethers.getContractFactory(
      SpeedJumpIrmArtifact.abi,
      SpeedJumpIrmArtifact.bytecode.object,
      admin,
    );

    irm = (await SpeedJumpIrmFactory.deploy(morphoAddress, ln2, speedFactor, targetUtilization, initialRate)) as IIrm;

    const loanAddress = await loan.getAddress();
    const collateralAddress = await collateral.getAddress();
    const oracleAddress = await oracle.getAddress();
    const irmAddress = await irm.getAddress();

    allMarketParams = _range(1, 1 + nbMarkets).map((i) => ({
      loanToken: loanAddress,
      collateralToken: collateralAddress,
      oracle: oracleAddress,
      irm: irmAddress,
      lltv: (BigInt.WAD * toBigInt(i)) / toBigInt(i + 1), // lltv >= 50%
    }));

    await morpho.enableIrm(irmAddress);

    for (const marketParams of allMarketParams) {
      await morpho.enableLltv(marketParams.lltv);
      await morpho.createMarket(marketParams);
    }

    const IMetaMorphoFactory = await hre.ethers.getContractFactory("MetaMorpho", admin);

    metaMorpho = await IMetaMorphoFactory.deploy(morphoAddress, 1, loanAddress, "MetaMorpho", "mB");

    const metaMorphoAddress = await metaMorpho.getAddress();

    for (const user of users) {
      await loan.setBalance(user.address, initBalance);
      await loan.connect(user).approve(metaMorphoAddress, MaxUint256);
      await collateral.setBalance(user.address, initBalance);
      await collateral.connect(user).approve(morphoAddress, MaxUint256);
    }

    await metaMorpho.setRiskManager(riskManager.address);
    await metaMorpho.setIsAllocator(allocator.address, true);

    await metaMorpho.submitTimelock(0);

    const block = await hre.ethers.provider.getBlock("latest");
    await setNextBlockTimestamp(block!.timestamp + 1);

    await metaMorpho.acceptTimelock();

    await metaMorpho.setFeeRecipient(admin.address);
    await metaMorpho.submitFee(BigInt.WAD / 10n);

    for (const marketParams of allMarketParams) {
      await metaMorpho
        .connect(riskManager)
        .submitCap(marketParams, (BigInt.WAD * 10n * toBigInt(suppliers.length)) / toBigInt(allMarketParams.length));
    }

    await metaMorpho.connect(riskManager).setSupplyQueue(allMarketParams.map(identifier));
    await metaMorpho.connect(riskManager).sortWithdrawQueue(allMarketParams.map((_, i) => nbMarkets - 1 - i));

    hre.tracer.nameTags[morphoAddress] = "Morpho";
    hre.tracer.nameTags[collateralAddress] = "Collateral";
    hre.tracer.nameTags[loanAddress] = "Loan";
    hre.tracer.nameTags[oracleAddress] = "Oracle";
    hre.tracer.nameTags[irmAddress] = "IRM";
    hre.tracer.nameTags[metaMorphoAddress] = "MetaMorpho";
  });

  it("should simulate gas cost [main]", async () => {
    for (let i = 0; i < suppliers.length; ++i) {
      logProgress("main", i, suppliers.length);

      const supplier = suppliers[i];

      let assets = BigInt.WAD * toBigInt(1 + Math.floor(random() * 100));

      await randomForwardTimestamp();

      await metaMorpho.connect(supplier).deposit(assets, supplier.address);

      await randomForwardTimestamp();

      await metaMorpho.connect(supplier).withdraw(assets / 2n, supplier.address, supplier.address);

      await randomForwardTimestamp();

      const allocation = await Promise.all(
        allMarketParams.map(async (marketParams) => {
          const id = identifier(marketParams);
          const market = await morpho.market(id);
          const position = await morpho.position(id, await metaMorpho.getAddress());

          const liquidity = market.totalSupplyAssets - market.totalBorrowAssets;
          const liquidShares = liquidity.mulDivDown(
            market.totalSupplyShares + virtualShares,
            market.totalSupplyAssets + virtualAssets,
          );

          return {
            marketParams,
            market,
            shares: position.supplyShares.min(liquidShares),
          };
        }),
      );

      await metaMorpho.connect(allocator).reallocate(
        allocation
          .map(({ marketParams, shares }) => ({
            marketParams,
            assets: 0n,
            // Always withdraw all, up to the liquidity.
            shares,
          }))
          .filter(({ shares }) => shares > 0n),
        allocation
          .map(({ marketParams, market, shares }) => {
            const assets = shares.mulDivDown(
              market.totalSupplyAssets + virtualAssets,
              market.totalSupplyShares + virtualShares,
            );

            // Always supply 3/4 of what the vault withdrawn.
            return { marketParams, assets: (assets * 3n) / 4n, shares: 0n };
          })
          .filter(({ assets }) => assets > 0n),
      );

      const borrower = borrowers[i];

      for (const marketParams of allMarketParams) {
        const market = await morpho.market(identifier(marketParams));
        const liquidity = market.totalSupplyAssets - market.totalBorrowAssets;

        if (liquidity < 2n) break;

        await randomForwardTimestamp();

        await morpho.connect(borrower).supplyCollateral(marketParams, liquidity, borrower.address, "0x");

        await randomForwardTimestamp();

        await morpho.connect(borrower).borrow(marketParams, liquidity / 2n, 0, borrower.address, borrower.address);
      }
    }
  });
});
