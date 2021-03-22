import { useCallback, useState } from 'react'
import BigNumber from 'bignumber.js'
import Web3Utils from 'web3-utils'
import type { TransactionReceipt } from 'web3-core'
import { useRedPacketContract } from '../contracts/useRedPacketContract'
import { useTransactionState, TransactionStateType } from '../../../web3/hooks/useTransactionState'
import { ERC20TokenDetailed, EthereumTokenType, EtherTokenDetailed, TransactionEventType } from '../../../web3/types'
import { useAccount } from '../../../web3/hooks/useAccount'
import type { Tx } from '@dimensiondev/contracts/types/types'
import { addGasMargin } from '../../../web3/helpers'
import { RED_PACKET_CONTRACT_VERSION } from '../constants'
import type { HappyRedPacketV2 } from '@dimensiondev/contracts/types/HappyRedPacketV2'
import Services from '../../../extension/service'
import { useChainId } from '../../../web3/hooks/useChainState'

export interface RedPacketSettings {
    password: string
    shares: number
    duration: number
    isRandom: boolean
    total: string
    name: string
    message: string
    token?: EtherTokenDetailed | ERC20TokenDetailed
}

export function useCreateCallback(redPacketSettings: Omit<RedPacketSettings, 'password'>) {
    const account = useAccount()
    const chainId = useChainId()
    const [createState, setCreateState] = useTransactionState()
    const redPacketContract = useRedPacketContract(RED_PACKET_CONTRACT_VERSION)
    const [createSettings, setCreateSettings] = useState<RedPacketSettings | null>(null)

    const createCallback = useCallback(async () => {
        const { duration, isRandom, message, name, shares, total, token } = redPacketSettings

        if (!token || !redPacketContract) {
            setCreateState({
                type: TransactionStateType.UNKNOWN,
            })
            return
        }

        // error handling
        if (new BigNumber(total).isLessThan(shares)) {
            setCreateState({
                type: TransactionStateType.FAILED,
                error: new Error('At least [number of red packets] tokens to your red packet.'),
            })
            return
        }
        if (shares <= 0) {
            setCreateState({
                type: TransactionStateType.FAILED,
                error: Error('At least 1 person should be able to claim the red packet.'),
            })
            return
        }
        if (token.type !== EthereumTokenType.Ether && token.type !== EthereumTokenType.ERC20) {
            setCreateState({
                type: TransactionStateType.FAILED,
                error: Error('Token not supported'),
            })
            return
        }

        // error: unable to sign password
        let signedPassword = ''
        try {
            signedPassword = await Services.Ethereum.sign(Web3Utils.sha3(message) ?? '', account, chainId)
        } catch (e) {
            signedPassword = ''
        }
        if (!signedPassword) {
            setCreateState({
                type: TransactionStateType.FAILED,
                error: new Error('Failed to sign password.'),
            })
            return
        }

        // it's trick, the password starts with '0x' would cause wrong password tx fail, so trim it.
        signedPassword = signedPassword!.slice(2)
        setCreateSettings({ ...redPacketSettings, password: signedPassword })

        // pre-step: start waiting for provider to confirm tx
        setCreateState({
            type: TransactionStateType.WAIT_FOR_CONFIRMING,
        })

        const seed = Math.random().toString()
        const config: Tx = {
            from: account,
            to: redPacketContract.options.address,
            value: new BigNumber(token.type === EthereumTokenType.Ether ? total : '0').toFixed(),
        }
        const params: Parameters<HappyRedPacketV2['methods']['create_red_packet']> = [
            Web3Utils.sha3(signedPassword)!,
            shares,
            isRandom,
            duration,
            Web3Utils.sha3(seed)!,
            message,
            name,
            token.type === EthereumTokenType.Ether ? 0 : 1,
            token.type === EthereumTokenType.Ether ? account : token.address, // this field must be a valid address
            total,
        ]

        // step 1: estimate gas
        const estimatedGas = await redPacketContract.methods
            .create_red_packet(...params)
            .estimateGas(config)
            .catch((error) => {
                setCreateState({
                    type: TransactionStateType.FAILED,
                    error,
                })
                throw error
            })

        // step 2: blocking
        return new Promise<void>(async (resolve, reject) => {
            const promiEvent = redPacketContract.methods.create_red_packet(...params).send({
                gas: addGasMargin(new BigNumber(estimatedGas)).toFixed(),
                ...config,
            })
            promiEvent.on(TransactionEventType.TRANSACTION_HASH, (hash: string) => {
                setCreateState({
                    type: TransactionStateType.HASH_WAIT,
                    hash,
                })
            })
            promiEvent.on(TransactionEventType.RECEIPT, (receipt: TransactionReceipt) => {
                setCreateSettings({ ...redPacketSettings, password: signedPassword })
                setCreateState({
                    type: TransactionStateType.CONFIRMED,
                    no: 0,
                    receipt,
                })
            })
            promiEvent.on(TransactionEventType.CONFIRMATION, (no: number, receipt: TransactionReceipt) => {
                setCreateSettings({ ...redPacketSettings, password: signedPassword })
                setCreateState({
                    type: TransactionStateType.CONFIRMED,
                    no,
                    receipt,
                })
                resolve()
            })
            promiEvent.on(TransactionEventType.ERROR, (error: Error) => {
                setCreateState({
                    type: TransactionStateType.FAILED,
                    error,
                })
                reject(error)
            })
        })
    }, [account, redPacketContract, redPacketSettings, chainId, setCreateState])

    const resetCallback = useCallback(() => {
        setCreateState({
            type: TransactionStateType.UNKNOWN,
        })
    }, [])

    return [createSettings, createState, createCallback, resetCallback] as const
}
