import { ConfigProvider } from 'tabby-core'

export interface TabActivityPlusConfig {
    quietTimeout: number
    dismissTimeout: number
    runningIdleTimeout: number
    runningColor1: string
    runningColor2: string
    successColor: string
    failedColor: string
    barHeight: number
}

export const TAP_DEFAULTS: TabActivityPlusConfig = {
    quietTimeout: 3,
    dismissTimeout: 1,
    runningIdleTimeout: 5,
    runningColor1: '#89b4fa',
    runningColor2: '#cba6f7',
    successColor: '#89b4fa',
    failedColor: '#cba6f7',
    barHeight: 3,
}

export class TabActivityPlusConfigProvider extends ConfigProvider {
    defaults = { tabActivityPlus: { ...TAP_DEFAULTS } }
}
