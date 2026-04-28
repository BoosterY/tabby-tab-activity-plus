import { ConfigProvider } from 'tabby-core'

export class TabActivityPlusConfigProvider extends ConfigProvider {
    defaults = {
        tabActivityPlus: {
            quietTimeout: 3,
            runningColor1: '#89b4fa',
            runningColor2: '#cba6f7',
            successColor: '#89b4fa',
            failedColor: '#cba6f7',
            barHeight: 3,
        },
    }
}
