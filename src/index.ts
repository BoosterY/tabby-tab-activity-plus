import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ConfigProvider } from 'tabby-core'
import { TerminalDecorator } from 'tabby-terminal'
import { TabActivityDecorator } from './decorator'
import { TabActivityPlusConfigProvider } from './config'

@NgModule({
    imports: [CommonModule],
    providers: [
        { provide: TerminalDecorator, useClass: TabActivityDecorator, multi: true },
        { provide: ConfigProvider, useClass: TabActivityPlusConfigProvider, multi: true },
    ],
})
export default class TabActivityPlusModule { }
