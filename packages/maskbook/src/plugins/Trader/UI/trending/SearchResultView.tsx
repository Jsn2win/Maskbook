import { useState } from 'react'
import { makeStyles, createStyles, Link, Tab, Tabs } from '@material-ui/core'
import { DataProvider, TagType, TradeProvider } from '../../types'
import { resolveDataProviderName, resolveDataProviderLink } from '../../pipes'
import { useTrendingById, useTrendingByKeyword } from '../../trending/useTrending'
import { TickersTable } from './TickersTable'
import { PriceChangedTable } from './PriceChangedTable'
import { PriceChart } from './PriceChart'
import { usePriceStats } from '../../trending/usePriceStats'
import { Days, PriceChartDaysControl } from './PriceChartDaysControl'
import { useCurrentDataProvider } from '../../trending/useCurrentDataProvider'
import { useCurrentTradeProvider } from '../../trending/useCurrentTradeProvider'
import { useI18N } from '../../../../utils/i18n-next-ui'
import { TradeView } from '../trader/TradeView'
import { CoinMarketPanel } from './CoinMarketPanel'
import { TrendingViewError } from './TrendingViewError'
import { TrendingViewSkeleton } from './TrendingViewSkeleton'
import { TrendingViewDeck } from './TrendingViewDeck'
import { useAvailableCoins } from '../../trending/useAvailableCoins'
import { usePreferredCoinId } from '../../trending/useCurrentCoinId'
import { EthereumTokenType } from '../../../../web3/types'
import { useTokenDetailed } from '../../../../web3/hooks/useTokenDetailed'
import { TradeContext, useTradeContext } from '../../trader/useTradeContext'
import { LBPPanel } from './LBPPanel'
import { useLBP } from '../../LBP/useLBP'
import { createERC20Token } from '../../../../web3/helpers'
import { useChainId } from '../../../../web3/hooks/useChainState'
import { Flags } from '../../../../utils/flags'

const useStyles = makeStyles((theme) => {
    return createStyles({
        root: {
            width: '100%',
            boxShadow: 'none',
            borderRadius: 0,
            marginBottom: theme.spacing(2),
            '&::-webkit-scrollbar': {
                display: 'none',
            },
        },
        header: {},
        body: {},
        footer: {
            borderTop: `solid 1px ${theme.palette.divider}`,
            borderBottom: `solid 1px ${theme.palette.divider}`,
        },
        skeletonFooter: {
            borderBottom: `solid 1px ${theme.palette.divider}`,
        },
        content: {
            padding: 0,
            border: 'none',
        },
        tabs: {
            borderTop: `solid 1px ${theme.palette.divider}`,
            borderBottom: `solid 1px ${theme.palette.divider}`,
            width: '100%',
            minHeight: 'unset',
        },
        tab: {
            minHeight: 'unset',
            minWidth: 'unset',
        },
    })
})

export interface SearchResultViewProps {
    name: string
    tagType: TagType
    dataProviders: DataProvider[]
    tradeProviders: TradeProvider[]
}

export function SearchResultView(props: SearchResultViewProps) {
    const { name, tagType, dataProviders, tradeProviders } = props

    const { t } = useI18N()
    const classes = useStyles()

    //#region trending
    const dataProvider = useCurrentDataProvider(dataProviders)
    //#endregion

    const chainId = useChainId()
    const [tabIndex, setTabIndex] = useState(dataProvider !== DataProvider.UNISWAP_INFO ? 1 : 0)
    //#region multiple coins share the same symbol
    const { value: coins = [] } = useAvailableCoins(tagType, name, dataProvider)
    //#endregion

    //#region merge trending
    const coinId = usePreferredCoinId(name, dataProvider)
    const trendingById = useTrendingById(coinId, dataProvider)
    const trendingByKeyword = useTrendingByKeyword(tagType, coinId ? '' : name, dataProvider)
    const {
        value: { currency, trending },
        error: trendingError,
        loading: loadingTrending,
    } = coinId ? trendingById : trendingByKeyword
    //#endregion

    //#region swap
    const { value: tokenDetailed, error: tokenDetailedError, loading: loadingTokenDetailed } = useTokenDetailed(
        trending?.coin.symbol.toLowerCase() === 'eth' ? EthereumTokenType.Ether : EthereumTokenType.ERC20,
        trending?.coin.symbol.toLowerCase() === 'eth' ? '' : trending?.coin.eth_address ?? '',
    )
    const tradeProvider = useCurrentTradeProvider(tradeProviders)
    //#endregion

    //#region stats
    const [days, setDays] = useState(Days.ONE_WEEK)
    const { value: stats = [], loading: loadingStats, retry: retryStats } = usePriceStats({
        coinId: trending?.coin.id,
        dataProvider: trending?.dataProvider,
        currency: trending?.currency,
        days,
    })
    //#endregion

    //#region LBP
    const LBP = useLBP(tokenDetailed?.type === EthereumTokenType.ERC20 ? tokenDetailed : undefined)
    //#endregion

    //#region trader context
    const tradeContext = useTradeContext(tradeProvider)
    //#endregion

    //#region no available providers
    if (dataProviders.length === 0) return null
    //#endregion

    //#region error handling
    // error: unknown coin or api error
    if (trendingError)
        return (
            <TrendingViewError
                message={
                    <span>
                        Fail to load trending info from{' '}
                        <Link
                            color="primary"
                            target="_blank"
                            rel="noopener noreferrer"
                            href={resolveDataProviderLink(dataProvider)}>
                            {resolveDataProviderName(dataProvider)}
                        </Link>
                        .
                    </span>
                }
                TrendingCardProps={{ classes: { root: classes.root } }}
            />
        )
    //#endregion

    //#region display loading skeleton
    const isEthereum = !!trending?.coin.eth_address || trending?.coin.symbol.toLowerCase() === 'eth'
    if (!currency || !trending || (isEthereum && !tokenDetailed) || loadingTrending || loadingTokenDetailed)
        return (
            <TrendingViewSkeleton
                classes={{ footer: classes.skeletonFooter }}
                TrendingCardProps={{ classes: { root: classes.root } }}
            />
        )
    //#endregion

    //#region tabs
    const { coin, market, tickers } = trending
    const tabs = [
        <Tab className={classes.tab} key="market" label={t('plugin_trader_tab_market')} />,
        <Tab className={classes.tab} key="price" label={t('plugin_trader_tab_price')} />,
        <Tab className={classes.tab} key="exchange" label={t('plugin_trader_tab_exchange')} />,
        isEthereum ? <Tab className={classes.tab} key="swap" label={t('plugin_trader_tab_swap')} /> : null,
        Flags.LBP_enabled && LBP ? <Tab className={classes.tab} key="lbp" label="LBP" /> : null,
    ].filter(Boolean)
    //#endregion

    return (
        <TradeContext.Provider value={tradeContext}>
            <TrendingViewDeck
                classes={{
                    header: classes.header,
                    body: classes.body,
                    footer: classes.footer,
                    content: classes.content,
                }}
                stats={stats}
                coins={coins}
                currency={currency}
                trending={trending}
                dataProvider={dataProvider}
                tradeProvider={tradeProvider}
                showDataProviderIcon={tabIndex < 3}
                showTradeProviderIcon={tabIndex === 3}
                TrendingCardProps={{ classes: { root: classes.root } }}>
                <Tabs
                    className={classes.tabs}
                    textColor="primary"
                    variant="fullWidth"
                    value={tabIndex}
                    onChange={(ev: React.ChangeEvent<{}>, newValue: number) => setTabIndex(newValue)}
                    TabIndicatorProps={{
                        style: {
                            display: 'none',
                        },
                    }}>
                    {tabs}
                </Tabs>
                {tabIndex === 0 ? <CoinMarketPanel dataProvider={dataProvider} trending={trending} /> : null}
                {tabIndex === 1 ? (
                    <>
                        {market ? <PriceChangedTable market={market} /> : null}
                        <PriceChart
                            coin={coin}
                            currency={currency}
                            stats={stats}
                            loading={loadingStats}
                            retry={retryStats}>
                            <PriceChartDaysControl days={days} onDaysChange={setDays} />
                        </PriceChart>
                    </>
                ) : null}
                {tabIndex === 2 ? <TickersTable tickers={tickers} dataProvider={dataProvider} /> : null}
                {tabIndex === 3 && isEthereum ? (
                    <TradeView
                        TraderProps={{
                            coin,
                            tokenDetailed,
                        }}
                    />
                ) : null}
                {Flags.LBP_enabled && LBP && tabIndex === tabs.length - 1 ? (
                    <LBPPanel
                        duration={LBP.duration}
                        currency={currency}
                        token={createERC20Token(
                            chainId,
                            LBP.token.address,
                            LBP.token.decimals,
                            LBP.token.name ?? '',
                            LBP.token.symbol ?? '',
                        )}
                    />
                ) : null}
            </TrendingViewDeck>
        </TradeContext.Provider>
    )
}
