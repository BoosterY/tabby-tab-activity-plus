import { Injectable } from '@angular/core'
import { AppService, ConfigService } from 'tabby-core'
import { TerminalDecorator, BaseTerminalTabComponent } from 'tabby-terminal'
import { TabActivityStateMachine, TabState } from './stateMachine'

import './styles.css'

interface TabActivityPlusConfig {
    quietTimeout: number
    runningColor1: string
    runningColor2: string
    successColor: string
    failedColor: string
    barHeight: number
}

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
        const defaults: TabActivityPlusConfig = { quietTimeout: 3, runningColor1: '#89b4fa', runningColor2: '#cba6f7', successColor: '#89b4fa', failedColor: '#cba6f7', barHeight: 3 }
        const cfg: TabActivityPlusConfig = { ...defaults, ...(this.config.store as Record<string, any>).tabActivityPlus }
        const quietTimeout = (cfg.quietTimeout ?? 3) * 1000

        const sm = new TabActivityStateMachine(quietTimeout)
        const state: TabActivityState = { sm, cfg, indicatorEl: null, tabHeaderEl: null, origPosition: '' }
        this.tabStates.set(terminal, state)

        // Subscribe to session output. Session may be null initially,
        // so we also handle the case where binaryOutput$ is on the terminal itself.
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
            }),
        )

        this.subscribeUntilDetached(terminal,
            terminal.blurred$.subscribe(() => {
                if (sm.state === 'running') {
                    this._updateIndicator(terminal, 'running')
                }
            }),
        )

        sm.onChange = (event) => {
            if (terminal.hasFocus && event.next === 'running') {
                return
            }
            this._updateIndicator(terminal, event.next)
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

    /**
     * Find the tab-header DOM element for a terminal.
     * Primary: match by index in app.tabs (handles duplicate titles).
     * Fallback: title text match with duplicate guard.
     */
    private _findTabHeader (terminal: BaseTerminalTabComponent): HTMLElement | null {
        const headers = document.querySelectorAll('tab-header')

        // Terminals are typically wrapped in SplitTabComponent,
        // so first try direct match, then check parent.
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

        // Fallback: title match, skip headers already claimed by another tab
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
