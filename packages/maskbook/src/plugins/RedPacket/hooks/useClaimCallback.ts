import { useCallback } from 'react'
import BigNumber from 'bignumber.js'
import Web3Utils from 'web3-utils'
import { useRedPacketContract } from '../contracts/useRedPacketContract'
import { useTransactionState, TransactionStateType } from '../../../web3/hooks/useTransactionState'
import type { Tx } from '@dimensiondev/contracts/types/types'
import { TransactionEventType } from '../../../web3/types'
import type { TransactionReceipt } from 'web3-core'
import { addGasMargin } from '../../../web3/helpers'

export function useClaimCallback(from: string, id?: string, password?: string) {
    const [claimState, setClaimState] = useTransactionState()
    const redPacketContract = useRedPacketContract()

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
        const params: Parameters<typeof redPacketContract['methods']['claim']> = [
            id,
            password,
            from,
            Web3Utils.sha3(from)!,
        ]

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
