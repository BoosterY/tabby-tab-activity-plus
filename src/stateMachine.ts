export type TabState = 'idle' | 'running' | 'running-idle' | 'success' | 'failed' | 'fallback' | 'fallback-idle'

export interface StateChangeEvent {
    prev: TabState
    next: TabState
    exitCode?: number
}

const ESC = String.fromCharCode(0x1b)
const BEL = String.fromCharCode(0x07)
const OSC_133_PREFIX = ESC + ']133;'

export class TabActivityStateMachine {
    private _state: TabState = 'idle'
    private _shellIntegrationDetected = false
    private _hadOutputWhileRunning = false
    private _suppressIndicator = false
    private _fallbackTimer: ReturnType<typeof setTimeout> | null = null
    private _dismissTimer: ReturnType<typeof setTimeout> | null = null
    private _runningIdleTimer: ReturnType<typeof setTimeout> | null = null
    private _quietTimeout: number
    private _dismissTimeout: number
    private _runningIdleTimeout: number

    onChange: ((event: StateChangeEvent) => void) | null = null

    get state (): TabState { return this._state }
    get hasShellIntegration (): boolean { return this._shellIntegrationDetected }
    get isSuppressed (): boolean { return this._suppressIndicator }

    constructor (quietTimeout = 3000, dismissTimeout = 2000, runningIdleTimeout = 5000) {
        this._quietTimeout = quietTimeout
        this._dismissTimeout = dismissTimeout
        this._runningIdleTimeout = runningIdleTimeout
    }

    processOutput (data: string, focused = false): void {
        const hadOSC = this._parseOSC133(data)

        // Track non-OSC output while running (for running-idle detection)
        if (!hadOSC && (this._state === 'running' || this._state === 'running-idle')) {
            this._hadOutputWhileRunning = true
            this._suppressIndicator = false
            // If we were in running-idle, go back to running
            if (this._state === 'running-idle') {
                this._transition('running')
            }
            this._resetRunningIdleTimer()
        }

        // Fallback mode: no shell integration
        if (!focused && !this._shellIntegrationDetected) {
            this._handleFallbackOutput()
        }
    }

    onFocused (): void {
        // Clear terminal states
        if (this._state === 'success' || this._state === 'failed' || this._state === 'fallback-idle') {
            this._transition('idle')
        }
        // Mark running-idle as "read" — suppress indicator until new output
        if (this._state === 'running-idle' || this._state === 'running') {
            this._suppressIndicator = true
            this._hadOutputWhileRunning = false
            if (this._state === 'running-idle') {
                this._transition('running')
            }
        }
        this._clearDismissTimer()
    }

    scheduleDismiss (): void {
        this._clearDismissTimer()
        this._dismissTimer = setTimeout(() => {
            if (this._state === 'success' || this._state === 'failed') {
                this._transition('idle')
            }
            this._dismissTimer = null
        }, this._dismissTimeout)
    }

    destroy (): void {
        this._clearFallbackTimer()
        this._clearDismissTimer()
        this._clearRunningIdleTimer()
        this.onChange = null
    }

    /**
     * Returns true if any OSC 133 sequence was found.
     */
    private _parseOSC133 (data: string): boolean {
        let found = false
        let searchFrom = 0
        while (true) {
            const idx = data.indexOf(OSC_133_PREFIX, searchFrom)
            if (idx < 0) break

            const payloadStart = idx + OSC_133_PREFIX.length
            const end = this._findTerminator(data, payloadStart)
            if (end < 0) break

            const payload = data.substring(payloadStart, end)
            this._shellIntegrationDetected = true
            found = true

            if (payload === 'C') {
                this._hadOutputWhileRunning = false
                this._suppressIndicator = false
                this._clearRunningIdleTimer()
                this._transition('running')
            } else if (payload.charAt(0) === 'D') {
                this._clearRunningIdleTimer()
                const parts = payload.split(';')
                const raw = parts.length > 1 ? parseInt(parts[1], 10) : 0
                const exitCode = Number.isNaN(raw) ? -1 : raw
                this._transition(exitCode === 0 ? 'success' : 'failed', exitCode)
            }

            searchFrom = end + 1
        }
        return found
    }

    private _findTerminator (data: string, pos: number): number {
        for (let i = pos; i < data.length; i++) {
            if (data[i] === BEL) return i
            if (data[i] === ESC && i + 1 < data.length && data[i + 1] === '\\') return i
        }
        return -1
    }

    private _handleFallbackOutput (): void {
        if (this._state === 'fallback-idle') {
            // Was idle after output stopped, now has new output → back to fallback
            this._transition('fallback')
        } else if (this._state !== 'fallback') {
            this._transition('fallback')
        }
        this._resetFallbackTimer()
    }

    private _resetFallbackTimer (): void {
        this._clearFallbackTimer()
        this._fallbackTimer = setTimeout(() => {
            if (this._state === 'fallback') {
                // Output stopped → show "unread output" indicator
                this._transition('fallback-idle')
            }
            this._fallbackTimer = null
        }, this._quietTimeout)
    }

    /**
     * Only starts if we've had output while running.
     * sleep 60 (no output) → never triggers → stays running (flashing).
     * Kiro (had output, then stops) → triggers → running-idle.
     */
    private _resetRunningIdleTimer (): void {
        this._clearRunningIdleTimer()
        if (!this._hadOutputWhileRunning) return
        this._runningIdleTimer = setTimeout(() => {
            if (this._state === 'running') {
                this._transition('running-idle')
            }
            this._runningIdleTimer = null
        }, this._runningIdleTimeout)
    }

    private _clearFallbackTimer (): void {
        if (this._fallbackTimer) { clearTimeout(this._fallbackTimer); this._fallbackTimer = null }
    }

    private _clearDismissTimer (): void {
        if (this._dismissTimer) { clearTimeout(this._dismissTimer); this._dismissTimer = null }
    }

    private _clearRunningIdleTimer (): void {
        if (this._runningIdleTimer) { clearTimeout(this._runningIdleTimer); this._runningIdleTimer = null }
    }

    private _transition (next: TabState, exitCode?: number): void {
        if (this._state === next) return
        const prev = this._state
        this._state = next
        this.onChange?.({ prev, next, exitCode })
    }
}
