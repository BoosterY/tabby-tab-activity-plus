import { Injectable } from '@angular/core'
import { AppService, ConfigService } from 'tabby-core'
import { TerminalDecorator, BaseTerminalTabComponent } from 'tabby-terminal'
import { TabActivityStateMachine, TabState } from './stateMachine'
import { TabActivityPlusConfig, TAP_DEFAULTS } from './config'

import './styles.css'

interface TabActivityState {
    sm: TabActivityStateMachine
    cfg: TabActivityPlusConfig
    indicatorEl: HTMLElement | null
    tabHeaderEl: HTMLElement | null
    origPosition: string
}

@Injectable()
export class TabActivityDecorator extends TerminalDecorator {
    private tabStates = new Map<BaseTerminalTabComponent, TabActivityState>()

    constructor (
        private config: ConfigService,
        private app: AppService,
    ) {
        super()
    }

    attach (terminal: BaseTerminalTabComponent): void {
        const cfg: TabActivityPlusConfig = { ...TAP_DEFAULTS, ...(this.config.store as Record<string, any>).tabActivityPlus }
        const quietTimeout = (cfg.quietTimeout ?? 3) * 1000

        const sm = new TabActivityStateMachine(quietTimeout, (cfg.dismissTimeout ?? 2) * 1000, (cfg.runningIdleTimeout ?? 5) * 1000)
        const state: TabActivityState = { sm, cfg, indicatorEl: null, tabHeaderEl: null, origPosition: '' }
        this.tabStates.set(terminal, state)

        const output$ = terminal.session?.binaryOutput$ ?? (terminal as any).binaryOutput$
        if (output$) {
            this.subscribeUntilDetached(terminal,
                output$.subscribe((data: Buffer) => {
                    sm.processOutput(data.toString('utf-8'), terminal.hasFocus)
                }),
            )
        }

        this.subscribeUntilDetached(terminal,
            terminal.focused$.subscribe(() => {
                sm.onFocused()
                // Hide indicator when tab is focused (regardless of state)
                this._removeIndicator(state)
            }),
        )

        this.subscribeUntilDetached(terminal,
            terminal.blurred$.subscribe(() => {
                const s = sm.state
                if (!sm.isSuppressed && (s === 'running' || s === 'running-idle')) {
                    this._updateIndicator(terminal, s)
                }
            }),
        )

        sm.onChange = (event) => {
            if (terminal.hasFocus) {
                if (event.next === 'running' || event.next === 'running-idle' || event.next === 'fallback' || event.next === 'fallback-idle') {
                    return
                }
                if (event.next === 'idle') {
                    this._removeIndicator(state)
                    return
                }
            }
            if (sm.isSuppressed) {
                return
            }
            this._updateIndicator(terminal, event.next)
            // Auto-dismiss success/failed on focused tab
            if (terminal.hasFocus && (event.next === 'success' || event.next === 'failed')) {
                sm.scheduleDismiss()
            }
        }
    }

    detach (terminal: BaseTerminalTabComponent): void {
        const state = this.tabStates.get(terminal)
        if (state) {
            state.sm.destroy()
            this._removeIndicator(state)
            this.tabStates.delete(terminal)
        }
        super.detach(terminal)
    }

    private _findTabHeader (terminal: BaseTerminalTabComponent): HTMLElement | null {
        const headers = document.querySelectorAll('tab-header')

        let idx = this.app.tabs.indexOf(terminal as any)
        if (idx < 0) {
            const parent = this.app.getParentTab(terminal as any)
            if (parent) {
                idx = this.app.tabs.indexOf(parent)
            }
        }
        if (idx >= 0 && idx < headers.length) {
            return headers[idx] as HTMLElement
        }

        for (const header of Array.from(headers)) {
            const nameEl = header.querySelector('.name')
            if (nameEl) {
                const title = (nameEl.textContent ?? '').trim()
                const tabTitle = (terminal.customTitle || terminal.title || '').trim()
                if (title === tabTitle && !header.querySelector('.tap-indicator')) {
                    return header as HTMLElement
                }
            }
        }
        return null
    }

    private _updateIndicator (terminal: BaseTerminalTabComponent, state: TabState): void {
        const tabState = this.tabStates.get(terminal)
        if (!tabState) return

        if (state === 'idle') {
            this._removeIndicator(tabState)
            return
        }

        if (!tabState.indicatorEl) {
            const header = this._findTabHeader(terminal)
            if (!header) return

            tabState.tabHeaderEl = header
            tabState.origPosition = header.style.position || ''
            if (!header.style.position || header.style.position === 'static') {
                header.style.position = 'relative'
            }

            const indicator = document.createElement('div')
            indicator.className = 'tap-indicator'
            indicator.style.setProperty('--tap-color1', tabState.cfg.runningColor1)
            indicator.style.setProperty('--tap-color2', tabState.cfg.runningColor2)
            indicator.style.setProperty('--tap-success-color', tabState.cfg.successColor)
            indicator.style.setProperty('--tap-failed-color', tabState.cfg.failedColor)
            indicator.style.setProperty('--tap-bar-height', tabState.cfg.barHeight + 'px')
            header.appendChild(indicator)
            tabState.indicatorEl = indicator
        }

        const el = tabState.indicatorEl
        el.className = 'tap-indicator tap-' + state
    }

    private _removeIndicator (tabState: TabActivityState): void {
        if (tabState.indicatorEl) {
            tabState.indicatorEl.remove()
            tabState.indicatorEl = null
        }
        if (tabState.tabHeaderEl) {
            tabState.tabHeaderEl.style.position = tabState.origPosition
            tabState.tabHeaderEl = null
        }
    }
}
