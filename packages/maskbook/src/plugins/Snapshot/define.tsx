import { useMemo, Suspense } from 'react'
import { Typography } from '@material-ui/core'
import { PluginConfig, PluginScope, PluginStage } from '../types'
import { SNAPSHOT_PLUGIN_NAME, SNAPSHOT_PLUGIN_ID } from './constants'
import MaskbookPluginWrapper from '../MaskbookPluginWrapper'
import { PostInspector } from './UI/PostInspector'
import { usePostInfoDetails } from '../../components/DataSource/usePostInfo'
import { extractTextFromTypedMessage } from '../../protocols/typed-message'
import { parseURL } from '../../utils/utils'

const isSnaphotURL = (x: string): boolean => /^https:\/\/(?:www.)?snapshot.[org|page]/.test(x)

export const SnapShotPluginDefine: PluginConfig = {
    pluginName: SNAPSHOT_PLUGIN_NAME,
    identifier: SNAPSHOT_PLUGIN_ID,
    stage: PluginStage.Production,
    scope: PluginScope.Public,
    successDecryptionInspector: function Component(props): JSX.Element | null {
        const text = useMemo(() => extractTextFromTypedMessage(props.message), [props.message])
        const link = useMemo(() => parseURL(text.val || ''), [text.val]).find(isSnaphotURL)
        if (!text.ok) return null
        if (!link) return null
        return <Renderer url={link} />
    },
    postInspector: function Component(): JSX.Element | null {
        const link = usePostInfoDetails('postMetadataMentionedLinks')
            .concat(usePostInfoDetails('postMentionedLinks'))
            .find(isSnaphotURL)
        if (!link) return null
        return <Renderer url={link} />
    },
}

function Renderer({ url }: { url: string }) {
    return (
        <MaskbookPluginWrapper pluginName="Snapshot">
            <Suspense
                fallback={
                    <Typography color="textPrimary" component="span" variant="body1">
                        loading...
                    </Typography>
                }>
                <PostInspector url={url} />
            </Suspense>
        </MaskbookPluginWrapper>
    )
}
