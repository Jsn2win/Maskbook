import { useCallback } from 'react'
import BigNumber from 'bignumber.js'
import Web3Utils from 'web3-utils'
import { useRedPacketContract } from '../contracts/useRedPacketContract'
import { useTransactionState, TransactionStateType } from '../../../web3/hooks/useTransactionState'
import type { Tx } from '@dimensiondev/contracts/types/types'
import { TransactionEventType } from '../../../web3/types'
import type { TransactionReceipt } from 'web3-core'
import type { HappyRedPacketV1 } from '@dimensiondev/contracts/types/HappyRedPacketV1'
import type { HappyRedPacketV2 } from '@dimensiondev/contracts/types/HappyRedPacketV2'
import { addGasMargin } from '../../../web3/helpers'

export function useClaimCallback(version: number, from: string, id?: string, password?: string) {
    const [claimState, setClaimState] = useTransactionState()
    const redPacketContract = useRedPacketContract(version)

    const claimCallback = useCallback(async () => {
        if (!redPacketContract || !id || !password) {
            setClaimState({
                type: TransactionStateType.UNKNOWN,
            })
            return
        }

        // pre-step: start waiting for provider to confirm tx
        setClaimState({
            type: TransactionStateType.WAIT_FOR_CONFIRMING,
        })

        const config: Tx = {
            from,
            to: redPacketContract.options.address,
        }

        const paramsWithoutType = [id, password, from, Web3Utils.sha3(from)!]
        // note: despite the method params type of V1 and V2 is the same,
        //  but it is more understandable to declare respectively
        const params =
            version === 1
                ? (paramsWithoutType as Parameters<HappyRedPacketV1['methods']['claim']>)
                : (paramsWithoutType as Parameters<HappyRedPacketV2['methods']['claim']>)

        // step 1: estimate gas
        const estimatedGas = await redPacketContract.methods
            .claim(...params)
            .estimateGas(config)
            .catch((error) => {
                setClaimState({
                    type: TransactionStateType.FAILED,
                    error,
                })
                throw error
            })

        // step 2-1: blocking
        return new Promise<void>((resolve, reject) => {
            const promiEvent = redPacketContract.methods.claim(...params).send({
                gas: addGasMargin(new BigNumber(estimatedGas)).toFixed(),
                ...config,
            })

            promiEvent.on(TransactionEventType.CONFIRMATION, (no: number, receipt: TransactionReceipt) => {
                setClaimState({
                    type: TransactionStateType.CONFIRMED,
                    no,
                    receipt,
                })
                resolve()
            })
            promiEvent.on(TransactionEventType.ERROR, (error: Error) => {
                setClaimState({
                    type: TransactionStateType.FAILED,
                    error,
                })
                reject(error)
            })
        })
    }, [id, password, from, redPacketContract])

    const resetCallback = useCallback(() => {
        setClaimState({
            type: TransactionStateType.UNKNOWN,
        })
    }, [])

    return [claimState, claimCallback, resetCallback] as const
}
