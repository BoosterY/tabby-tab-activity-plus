export type TabState = 'idle' | 'running' | 'success' | 'failed' | 'fallback'

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
    private _fallbackTimer: ReturnType<typeof setTimeout> | null = null
    private _quietTimeout: number

    onChange: ((event: StateChangeEvent) => void) | null = null

    get state (): TabState { return this._state }
    get hasShellIntegration (): boolean { return this._shellIntegrationDetected }

    constructor (quietTimeout = 3000) {
        this._quietTimeout = quietTimeout
    }

    /**
     * Process terminal output, scanning for OSC 133 sequences.
     * When focused, only OSC parsing runs (skip fallback) for performance.
     */
    processOutput (data: string, focused = false): void {
        this._parseOSC133(data)

        // Skip fallback detection when tab is focused or shell integration is active
        if (!focused && !this._shellIntegrationDetected) {
            this._handleFallbackOutput()
        }
    }

    onFocused (): void {
        if (this._state === 'success' || this._state === 'failed') {
            this._transition('idle')
        }
    }

    destroy (): void {
        if (this._fallbackTimer) {
            clearTimeout(this._fallbackTimer)
            this._fallbackTimer = null
        }
        this.onChange = null
    }

    /**
     * Parse OSC 133 sequences manually (avoids regex minification issues).
     * OSC 133;C = command started (preexec)
     * OSC 133;D;{exit_code} = command finished (precmd)
     * Terminators: BEL (\x07) or ST (\x1b\\)
     */
    private _parseOSC133 (data: string): void {
        let searchFrom = 0
        while (true) {
            const idx = data.indexOf(OSC_133_PREFIX, searchFrom)
            if (idx < 0) break

            const payloadStart = idx + OSC_133_PREFIX.length
            const end = this._findTerminator(data, payloadStart)
            if (end < 0) break

            const payload = data.substring(payloadStart, end)
            this._shellIntegrationDetected = true

            if (payload === 'C') {
                this._transition('running')
            } else if (payload.charAt(0) === 'D') {
                const parts = payload.split(';')
                const raw = parts.length > 1 ? parseInt(parts[1], 10) : 0
                const exitCode = Number.isNaN(raw) ? -1 : raw
                this._transition(exitCode === 0 ? 'success' : 'failed', exitCode)
            }

            searchFrom = end + 1
        }
    }

    /** Find BEL or ST terminator starting from pos. Returns -1 if not found. */
    private _findTerminator (data: string, pos: number): number {
        for (let i = pos; i < data.length; i++) {
            if (data[i] === BEL) return i
            if (data[i] === ESC && i + 1 < data.length && data[i + 1] === '\\') return i
        }
        return -1
    }

    private _handleFallbackOutput (): void {
        if (this._state !== 'fallback') {
            this._transition('fallback')
        }
        this._resetFallbackTimer()
    }

    private _resetFallbackTimer (): void {
        if (this._fallbackTimer) {
            clearTimeout(this._fallbackTimer)
        }
        this._fallbackTimer = setTimeout(() => {
            if (this._state === 'fallback') {
                this._transition('idle')
            }
            this._fallbackTimer = null
        }, this._quietTimeout)
    }

    private _transition (next: TabState, exitCode?: number): void {
        if (this._state === next) return
        const prev = this._state
        this._state = next
        this.onChange?.({ prev, next, exitCode })
    }
}
