import { useCallback } from 'react'
import BigNumber from 'bignumber.js'
import { useRedPacketContract } from '../contracts/useRedPacketContract'
import { useTransactionState, TransactionStateType } from '../../../web3/hooks/useTransactionState'
import type { Tx } from '@dimensiondev/contracts/types/types'
import { addGasMargin } from '../../../web3/helpers'
import { TransactionEventType } from '../../../web3/types'
import type { TransactionReceipt } from 'web3-core'

export function useRefundCallback(from: string, id?: string) {
    const [refundState, setRefundState] = useTransactionState()
    const redPacketContract = useRedPacketContract()

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
        const params: Parameters<typeof redPacketContract['methods']['refund']> = [id]

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
