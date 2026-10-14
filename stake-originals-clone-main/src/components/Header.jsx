import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { useThemeSettings } from '../context/ThemeContext'
import { isGamePath } from '../games'

const EuroIcon = ({ size = 20, fontSize = 12 }) => (
    <div style={{
        width: size,
        height: size,
        minWidth: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        background: '#d1f36a',
        color: '#111411',
        fontWeight: 800,
        fontSize: fontSize,
        boxShadow: '0 2px 8px rgba(209, 243, 106, 0.18)',
        lineHeight: 1,
    }} title="Demo euro balance">€</div>
)

function Header({ menuOpen, menuButtonRef, onMenuClick }) {
    const location = useLocation()
    const { balance, activeSessionId, redeemDemoCredits, clearDemoSession, updateBalance, transactions, toasts } = useWallet()
    const { paletteId, palettes, setPaletteId } = useThemeSettings()
    const [showWalletDropdown, setShowWalletDropdown] = useState(false)
    const [demoAmount, setDemoAmount] = useState('10')
    const [createdPass, setCreatedPass] = useState(null)
    const [sessionIdInput, setSessionIdInput] = useState('')
    const [depositCodeInput, setDepositCodeInput] = useState('')
    const [withdrawSessionId, setWithdrawSessionId] = useState(activeSessionId)
    const [withdrawExitCode, setWithdrawExitCode] = useState('')
    const [withdrawAmount, setWithdrawAmount] = useState('')
    const [walletMessage, setWalletMessage] = useState('')
    const [walletBusy, setWalletBusy] = useState(false)
    const dropdownRef = useRef(null)

    const isGamePage = isGamePath(location.pathname)
    const isHomePage = location.pathname === '/'

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowWalletDropdown(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useEffect(() => {
        setWithdrawSessionId(activeSessionId)
    }, [activeSessionId])

    const sendDemoRequest = async (path, payload) => {
        const response = await fetch(path, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
        })
        const result = await response.json().catch(() => ({ error: 'Demo service is not ready. Try again later.' }))
        if (!response.ok) throw new Error(result.error || 'Demo request failed.')
        return result
    }

    const handleCreateDemoPass = async () => {
        setWalletBusy(true)
        setWalletMessage('')
        try {
            const result = await sendDemoRequest('/api/deposit', { amount: Number(demoAmount) })
            setCreatedPass(result)
            setSessionIdInput(result.sessionId)
            setDepositCodeInput('')
            setWalletMessage(`€${Number(result.amount).toFixed(2)} demo deposit pass created. No payment was taken.`)
        } catch (error) {
            setWalletMessage(error.message)
        } finally {
            setWalletBusy(false)
        }
    }

    const handleRedeemDemoPass = async () => {
        setWalletBusy(true)
        setWalletMessage('')
        try {
            const result = await sendDemoRequest('/api/redeem', {
                sessionId: sessionIdInput.trim(),
                depositCode: depositCodeInput.trim(),
            })
            const startingEuroBalance = result.startingChips / 100
            redeemDemoCredits(startingEuroBalance, sessionIdInput.trim().toUpperCase())
            setWalletMessage(`€${startingEuroBalance.toFixed(2)} demo balance added. No money was paid.`)
        } catch (error) {
            setWalletMessage(error.message)
        } finally {
            setWalletBusy(false)
        }
    }

    const handleDemoWithdrawal = async () => {
        setWalletBusy(true)
        setWalletMessage('')
        try {
            const result = await sendDemoRequest('/api/withdraw', {
                sessionId: withdrawSessionId.trim(),
                exitCode: withdrawExitCode.trim(),
                reportedEuroAmount: Number(withdrawAmount),
            })
            clearDemoSession(withdrawSessionId.trim().toUpperCase())
            updateBalance(0)
            setWithdrawExitCode('')
            setWithdrawAmount('')
            setWalletMessage(`Receipt checked for €${result.reportedEuroAmount}. This is a simulation; no money was sent.`)
        } catch (error) {
            setWalletMessage(error.message)
        } finally {
            setWalletBusy(false)
        }
    }

    const formattedBalance = balance.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })

    return (
        <header className={`header ${isHomePage ? 'header-home' : ''}`}>
            <div className="header-left">
                <Link to="/" className="logo-link">
                    <span className="logo" style={{ color: 'var(--text-primary)' }}>Stake</span>
                </Link>
            </div>

            <div className="header-center">
                <div className="header-wallet">
                    <button
                        type="button"
                        className="mobile-wallet-balance"
                        aria-label={`Open wallet, balance €${formattedBalance}`}
                        aria-expanded={showWalletDropdown}
                        onClick={() => setShowWalletDropdown(!showWalletDropdown)}
                    >
                        <EuroIcon size={18} fontSize={11} />
                        <span>{formattedBalance}</span>
                    </button>
                    {isGamePage && (
                        <>
                            <div className="wallet-balance-display">
                            <EuroIcon size={18} fontSize={11} />
                            <span className="wallet-balance-amount">{formattedBalance}</span>
                            <button
                                className="wallet-dropdown-toggle"
                                onClick={() => setShowWalletDropdown(!showWalletDropdown)}
                            >
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                    <path d="M7 10l5 5 5-5z" />
                                </svg>
                            </button>
                            </div>
                            <button className="wallet-btn" onClick={() => setShowWalletDropdown(!showWalletDropdown)}>
                                Wallet
                            </button>
                        </>
                    )}

                    {/* Wallet Dropdown */}
                        {showWalletDropdown && (
                            <div className="wallet-dropdown" ref={dropdownRef}>
                                <div className="wallet-dropdown-header">
                                    <h4>Demo wallet</h4>
                                    <button className="wallet-close-btn" onClick={() => setShowWalletDropdown(false)}>
                                        ✕
                                    </button>
                                </div>

                                <div className="wallet-balance-section">
                                    <div className="wallet-balance-label">Demo euro balance</div>
                                    <div className="wallet-balance-big">€{formattedBalance}</div>
                                </div>

                                <div className="wallet-actions">
                                    <div className="demo-only-note">DEMO ONLY · no payment method · no cash value</div>
                                    <label className="wallet-demo-label">
                                        Demo deposit amount
                                        <select className="wallet-demo-select" value={demoAmount} onChange={(event) => setDemoAmount(event.target.value)}>
                                            <option value="10">€10.00 demo value</option>
                                            <option value="20">€20.00 demo value</option>
                                            <option value="50">€50.00 demo value</option>
                                        </select>
                                    </label>
                                    <button className="wallet-deposit-btn" onClick={handleCreateDemoPass} disabled={walletBusy}>
                                        Create demo deposit code
                                    </button>
                                    {createdPass && (
                                        <div className="demo-pass-result" aria-live="polite">
                                            <span>SESSION ID</span>
                                            <div className="demo-pass-code-row"><strong>{createdPass.sessionId}</strong><button type="button" onClick={() => navigator.clipboard?.writeText(createdPass.sessionId)}>Copy</button></div>
                                            <span>DEMO DEPOSIT CODE</span>
                                            <div className="demo-pass-code-row"><strong>{createdPass.depositCode}</strong><button type="button" onClick={() => navigator.clipboard?.writeText(createdPass.depositCode)}>Copy</button></div>
                                        </div>
                                    )}
                                    <label className="wallet-demo-label">
                                        Session ID
                                        <input
                                            className="wallet-deposit-input"
                                            value={sessionIdInput}
                                            maxLength={8}
                                            autoComplete="off"
                                            onChange={(event) => setSessionIdInput(event.target.value.toUpperCase())}
                                            placeholder="8 HEX CHARACTERS"
                                        />
                                    </label>
                                    <label className="wallet-demo-label">
                                        Enter demo deposit code
                                        <input
                                            className="wallet-deposit-input"
                                            value={depositCodeInput}
                                            maxLength={8}
                                            autoComplete="off"
                                            onChange={(event) => setDepositCodeInput(event.target.value.toUpperCase())}
                                            placeholder="8 HEX CHARACTERS"
                                        />
                                    </label>
                                    <button className="wallet-deposit-btn" onClick={handleRedeemDemoPass} disabled={walletBusy}>
                                        Redeem demo code
                                    </button>
                                    {walletMessage && <p className="wallet-demo-message" role="status">{walletMessage}</p>}
                                    {activeSessionId && (
                                        <div className="wallet-demo-withdraw">
                                            <span className="wallet-demo-section-title">DEMO WITHDRAWAL · NO MONEY SENT</span>
                                            <label className="wallet-demo-label">
                                                Session ID
                                                <input className="wallet-deposit-input" value={withdrawSessionId} maxLength={8} onChange={(event) => setWithdrawSessionId(event.target.value.toUpperCase())} />
                                            </label>
                                            <label className="wallet-demo-label">
                                                Calculator exit code
                                                <input className="wallet-deposit-input" value={withdrawExitCode} maxLength={8} autoComplete="off" onChange={(event) => setWithdrawExitCode(event.target.value.toUpperCase())} placeholder="8 HEX CHARACTERS" />
                                            </label>
                                            <label className="wallet-demo-label">
                                                Final demo euro amount
                                                <input className="wallet-deposit-input" type="number" min="0" step="0.01" value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} placeholder="0.00" />
                                            </label>
                                            <button className="wallet-deposit-btn" onClick={handleDemoWithdrawal} disabled={walletBusy}>
                                                Check demo withdrawal
                                            </button>
                                        </div>
                                        )}
                                </div>

                                {/* Recent Transactions */}
                                <div className="wallet-transactions">
                                    <h5>Recent Activity</h5>
                                    {transactions.length === 0 ? (
                                        <div className="wallet-no-tx">No transactions yet</div>
                                    ) : (
                                        <div className="wallet-tx-list">
                                            {transactions.slice(0, 8).map(tx => (
                                                <div key={tx.id} className={`wallet-tx-item ${tx.type}`}>
                                                    <div className="wallet-tx-info">
                                                        <span className="wallet-tx-type">
                                                            {tx.type === 'bet' && '🎲 Bet'}
                                                            {tx.type === 'win' && '🏆 Win'}
                                                            {tx.type === 'demo-credit' && 'Demo euro balance'}
                                                            {tx.type === 'reset' && '🔄 Reset'}
                                                        </span>
                                                        <span className="wallet-tx-time">
                                                            {tx.timestamp.toLocaleTimeString()}
                                                        </span>
                                                    </div>
                                                    <span className={`wallet-tx-amount ${tx.amount >= 0 ? 'positive' : 'negative'}`}>
                                                        {tx.amount >= 0 ? '+' : '-'}€{Math.abs(tx.amount).toFixed(2)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                    {/* Game Toasts — below wallet */}
                    {isGamePage && toasts.length > 0 && (
                        <div className="wallet-toast-container">
                            {toasts.map(toast => (
                                <div key={toast.id} className={`wallet-toast wallet-toast-${toast.type}`}>
                                    <div className="wallet-toast-icon">
                                        {toast.type === 'bet' && (
                                            <EuroIcon size={20} fontSize={11} />
                                        )}
                                        {toast.type === 'win' && (
                                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        )}
                                        {toast.type === 'loss' && (
                                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ed4245" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="18" y1="6" x2="6" y2="18" />
                                                <line x1="6" y1="6" x2="18" y2="18" />
                                            </svg>
                                        )}
                                        {toast.type === 'error' && (
                                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f7931a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="12" y1="8" x2="12" y2="12" />
                                                <line x1="12" y1="16" x2="12.01" y2="16" />
                                            </svg>
                                        )}
                                    </div>
                                    <div className="wallet-toast-content">
                                        <span className="wallet-toast-title">{toast.title}</span>
                                        <span className="wallet-toast-desc">{toast.description}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {!isGamePage && (
                    <div className="search-input-wrapper">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="var(--text-secondary)" className="search-icon"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path></svg>
                        <input type="text" placeholder="Search your game" className="search-input" />
                    </div>
                )}
            </div>

            <div className="header-right">
                <label className="palette-select-label">
                    <span className="palette-select-text">Palette</span>
                    <select
                        className="palette-select"
                        value={paletteId}
                        onChange={(event) => setPaletteId(event.target.value)}
                        aria-label="Color palette"
                    >
                        {palettes.map((palette) => (
                            <option key={palette.id} value={palette.id}>{palette.name}</option>
                        ))}
                    </select>
                </label>
                {isGamePage ? (
                    /* Icons when on game page */
                    <>
                        <button className="header-icon-btn" title="Search">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path></svg>
                        </button>
                        <button className="header-icon-btn" title="Profile">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path></svg>
                        </button>
                        <button className="header-icon-btn" title="Notifications">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"></path></svg>
                        </button>
                        <button className="header-icon-btn" title="Chat">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"></path></svg>
                        </button>
                    </>
                ) : (
                    <>
                        <button className="wallet-btn demo-wallet-trigger" onClick={() => setShowWalletDropdown(!showWalletDropdown)}>
                            Demo wallet
                        </button>
                    </>
                )}
                <button
                    ref={menuButtonRef}
                    type="button"
                    className="mobile-menu-button"
                    aria-label="Open navigation menu"
                    aria-haspopup="dialog"
                    aria-expanded={menuOpen}
                    onClick={onMenuClick}
                >
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                        <path d="M3 6h18v2H3V6m0 5h18v2H3v-2m0 5h18v2H3v-2z" />
                    </svg>
                </button>
            </div>
        </header>
    )
}

export default Header
