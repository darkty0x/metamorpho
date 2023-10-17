# Morpho Blue MetaMorpho

[Morpho Blue](https://github.com/morpho-org/morpho-blue) is a trustless lending primitive that offers unparalleled efficiency and flexibility.

MetaMorpho is a protocol for noncustodial risk management built on top of Morpho Blue.
It enables anyone to create a vault depositing liquidity into multiple Morpho Blue markets.
It offers a seamless experience similar to Aave and Compound.

Users of MetaMorpho are liquidity providers that want to earn from borrowing interest whithout having to actively manage the risk of their position.
The active management of the deposited assets is the responsibility of a set of different roles (owner, curator and allocators).
These roles are primarily responsible for enabling and disabling markets on Morpho Blue and managing the allocation of users’ funds.

## Overview

### MetaMorpho

[`MetaMorpho`](./src/MetaMorpho.sol) vaults are [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) compliant vaults with the permit feature ([ERC-2612](https://eips.ethereum.org/EIPS/eip-2612)).
One MetaMorpho vault is related to one loan asset on Morpho Blue.
The [`MetaMorphoFactory`](./src/MetaMorphoFactory.sol) is a permissionless, free and immutable factory contract deploying immutable onchain instances of MetaMorpho vaults.

Users can supply or withdraw assets at any time, depending on the available liquidity on Morpho Blue.
A maximum of 30 markets can be enabled on a given MetaMorpho vault.
Each market has a supply cap configured onchain that guarantees lenders a maximum absolute exposure to the specific market.

There are 4 different roles for a MetaMorpho vault (owner, curator, guardian & allocators).
The vault manager can extract a performance fee (up to 50%) from the total interest generated.
All actions that may be against users' interests (e.g. enabling a market with a high exposure, increasing the fee) are subject to a timelock of minimum 12 hours.
During this timelock, users who disagree with the policy change can withdraw their funds from the vault or the guardian (if it is set) can revoke the action. After the timelock, the action can be executed by anyone until 3 days have passed.

### Roles

#### Owner

Only one single address can have this role.

It can:
- Do whatever the curator and allocators can do.
- Transfer or renounce the ownership.
- Set the curator.
- Set allocators.
- Set the rewards recipient.
- [Timelocked] Set the timelock.
- [Timelocked with no possible veto] Set the performance fee (capped to 50%).
- [Timelocked] Set the guardian.
- Set the fee recipient.

#### Curator

Only one single address can have this role.

It can:
- Do whatever the allocators can do.
- [Timelocked] Enable or disable a market by setting a cap to a specific market.
    - The cap must be set to 0 to disable the market.
	- Disabling a market can then only be done if the vault has no liquidity supplied on the market.

#### Allocator

Multiple addresses can have this role.

It can:
- Set the `supplyQueue` and `withdrawQueue`, ie decides on the order of the markets to supply/withdraw from.
    - Upon a deposit, the vault will supply up to the cap of each Morpho Blue market in the supply queue in the order set. The remaining funds are left as idle supply on the vault (uncapped).
	- Upon a withdrawal, the vault will first withdraw from the idle supply, then withdraw up to the liquidity of each Morpho Blue market in the withdrawal queue in the order set.
	- The `supplyQueue` can only contain enabled markets.
	- The `withdrawQueue` MUST contain all enabled markets on which the vault has still liquidity (enabled market are markets with non-zero cap or with non-zero vault's supply).
- Reallocate funds among the enabled market at any moment.

#### Guardian

Only one single address can have this role.

It can:
- Revoke any timelocked action except it can't revoke a pending fee.

### Rewards

The vault may be entitled to some rewards emitted on Morpho Blue markets the vault has supplied to. The vault's owner has the choice to distribute back these rewards to vault depositors however they want. To this end, it is advised to use the [Universal Rewards Distributor (URD)](https://github.com/morpho-org/universal-rewards-distributor).

Below is a typical example of how this use case would take place:

- If not already done:
    - Create a URD using the [UrdFactory](https://github.com/morpho-org/universal-rewards-distributor/blob/main/src/UrdFactory.sol) (can be done with an EOA).
    - Set the vault’s rewards recipient address to the created URD using `setRewardsRecipient`.

- Claim tokens from the Morpho Blue distribution to the vault.

	NB: Anyone can claim tokens on behalf of the vault and automatically transfer them to the vault.
	Thus, this step might be already performed by some third-party.

- Transfer rewards from the vault to the rewards distributor using the `transferRewards` function.

	NB: Anyone can transfer rewards from the vault to the rewards distributor unless it is unset. Thus, this step might be already performed by some third-party.
    Note: the amount of rewards transferred is calculated based on the balance in the reward asset of the vault. In case the reward asset is the vault’s asset, the vault’s idle liquidity is automatically subtracted to prevent stealing idle liquidity.

- Compute the new root for the vault’s rewards distributor, submit it, wait for the timelock (if any), accept the root, and let vault depositors claim their rewards according to the vault manager’s rewards re-distribution strategy.

## Getting Started

Install dependencies: `yarn`

Run forge tests: `yarn test:forge`

Run hardhat tests: `yarn test:hardhat`

You will find other useful commands in the [`package.json`](./package.json) file.

## License

MetaMorpho is licensed under `GPL-2.0-or-later`, see [`LICENSE`](./LICENSE).
