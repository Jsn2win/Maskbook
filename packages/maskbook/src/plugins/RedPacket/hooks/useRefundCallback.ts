import { useCallback } from 'react'
import BigNumber from 'bignumber.js'
import { useRedPacketContract } from '../contracts/useRedPacketContract'
import { useTransactionState, TransactionStateType } from '../../../web3/hooks/useTransactionState'
import type { Tx } from '@dimensiondev/contracts/types/types'
import { addGasMargin } from '../../../web3/helpers'
import type { HappyRedPacketV1 } from '@dimensiondev/contracts/types/HappyRedPacketV1'
import type { HappyRedPacketV2 } from '@dimensiondev/contracts/types/HappyRedPacketV2'
import { TransactionEventType } from '../../../web3/types'
import type { TransactionReceipt } from 'web3-core'

export function useRefundCallback(version: number, from: string, id?: string) {
    const [refundState, setRefundState] = useTransactionState()
    const redPacketContract = useRedPacketContract(version)

    const refundCallback = useCallback(async () => {
        if (!redPacketContract || !id) {
            setRefundState({
                type: TransactionStateType.UNKNOWN,
            })
            return
        }

        // pre-step: start waiting for provider to confirm tx
        setRefundState({
            type: TransactionStateType.WAIT_FOR_CONFIRMING,
        })

        const config: Tx = {
            from,
            to: redPacketContract.options.address,
        }
        const paramsWithoutType = [id]
        const params =
            version === 1
                ? (paramsWithoutType as Parameters<HappyRedPacketV1['methods']['refund']>)
                : (paramsWithoutType as Parameters<HappyRedPacketV2['methods']['refund']>)

        // step 1: estimate gas
        const estimatedGas = await redPacketContract.methods
            .refund(...params)
            .estimateGas(config)
            .catch((error) => {
                setRefundState({
                    type: TransactionStateType.FAILED,
                    error,
                })
                throw error
            })

        // step 2: blocking
        return new Promise<void>((resolve, reject) => {
            const promiEvent = redPacketContract.methods.refund(...params).send({
                gas: addGasMargin(new BigNumber(estimatedGas)).toFixed(),
                ...config,
            })

            promiEvent.on(TransactionEventType.CONFIRMATION, (no: number, receipt: TransactionReceipt) => {
                setRefundState({
                    type: TransactionStateType.CONFIRMED,
                    no,
                    receipt,
                })
                resolve()
            })
            promiEvent.on(TransactionEventType.ERROR, (error: Error) => {
                setRefundState({
                    type: TransactionStateType.FAILED,
                    error,
                })
                reject(error)
            })
        })
    }, [id, redPacketContract, from])

    const resetCallback = useCallback(() => {
        setRefundState({
            type: TransactionStateType.UNKNOWN,
        })
    }, [])

    return [refundState, refundCallback, resetCallback] as const
}
