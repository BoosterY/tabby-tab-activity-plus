import { NgModule } from '@angular/core'
import { ConfigProvider } from 'tabby-core'
import { TerminalDecorator } from 'tabby-terminal'
import { TabActivityDecorator } from './decorator'
import { TabActivityPlusConfigProvider } from './config'

@NgModule({
    providers: [
        { provide: TerminalDecorator, useClass: TabActivityDecorator, multi: true },
        { provide: ConfigProvider, useClass: TabActivityPlusConfigProvider, multi: true },
    ],
})
export default class TabActivityPlusModule { }
