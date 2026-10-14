import { createContext, useContext, useState, useCallback, useRef } from 'react'

const WalletContext = createContext(null)

const INITIAL_BALANCE = 0
const STORAGE_KEY = 'pocket_arcade_demo_euros_v2'
const LEGACY_STORAGE_KEY = 'pocket_arcade_demo_chips_v1'
const SESSION_STORAGE_KEY = 'pocket_arcade_active_demo_session'

function getStoredBalance() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored !== null) {
            const parsed = Number.parseFloat(stored)
            return isNaN(parsed) ? INITIAL_BALANCE : parsed
        }
        const legacyChips = localStorage.getItem(LEGACY_STORAGE_KEY)
        if (legacyChips !== null) {
            const parsedChips = Number.parseFloat(legacyChips)
            const migratedEuros = Number.isFinite(parsedChips) ? parseFloat((parsedChips / 100).toFixed(2)) : INITIAL_BALANCE
            localStorage.setItem(STORAGE_KEY, String(migratedEuros))
            localStorage.removeItem(LEGACY_STORAGE_KEY)
            return migratedEuros
        }
    } catch (e) { /* ignore */ }
    return INITIAL_BALANCE
}

export function WalletProvider({ children }) {
    const [balance, setBalance] = useState(getStoredBalance)
    const balanceRef = useRef(balance)
    const [currency, setCurrency] = useState('EUR')
    const [activeSessionId, setActiveSessionId] = useState(() => {
        try { return localStorage.getItem(SESSION_STORAGE_KEY) || '' } catch { return '' }
    })
    const [transactions, setTransactions] = useState([])

    // Toast system
    const [toasts, setToasts] = useState([])
    const toastIdRef = useRef(0)

    const showToast = useCallback((type, title, description, duration = 3000) => {
        const id = ++toastIdRef.current
        setToasts(prev => [...prev, { id, type, title, description }])
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, duration)
    }, [])

    const setStoredBalance = useCallback((nextBalance) => {
        const rounded = parseFloat(nextBalance.toFixed(2))
        balanceRef.current = rounded
        setBalance(rounded)
        try { localStorage.setItem(STORAGE_KEY, rounded.toString()) } catch (e) { /* ignore */ }
        return rounded
    }, [])

    // Update balance and persist to localStorage
    const updateBalance = useCallback((newBalance) => {
        setStoredBalance(newBalance)
    }, [setStoredBalance])

    // Place a bet (deduct from balance)
    const placeBet = useCallback((amount) => {
        const amt = parseFloat(amount)
        if (isNaN(amt) || amt <= 0 || amt > balanceRef.current) return false

        const newBal = setStoredBalance(balanceRef.current - amt)
        setTransactions(txs => [{
            id: Date.now(),
            type: 'bet',
            amount: -amt,
            balance: newBal,
            timestamp: new Date(),
        }, ...txs].slice(0, 100))

        return true
    }, [setStoredBalance])

    // Add winnings to balance
    const addWinnings = useCallback((amount) => {
        const amt = parseFloat(amount)
        if (isNaN(amt) || amt <= 0) return

        const newBal = setStoredBalance(balanceRef.current + amt)
        setTransactions(txs => [{
            id: Date.now(),
            type: 'win',
            amount: amt,
            balance: newBal,
            timestamp: new Date(),
        }, ...txs].slice(0, 100))
    }, [setStoredBalance])

    const redeemDemoCredits = useCallback((amountEuro, sessionId) => {
        const amt = parseFloat(amountEuro)
        if (isNaN(amt) || amt <= 0 || !sessionId) return

        const newBal = setStoredBalance(amt)
        setActiveSessionId(sessionId)
        try { localStorage.setItem(SESSION_STORAGE_KEY, sessionId) } catch (e) { /* ignore */ }
        setTransactions(txs => [{
            id: Date.now(),
            type: 'demo-credit',
            amount: amt,
            balance: newBal,
            timestamp: new Date(),
        }, ...txs].slice(0, 100))
    }, [setStoredBalance])

    const clearDemoSession = useCallback((sessionId) => {
        setActiveSessionId(current => {
            if (sessionId && current !== sessionId) return current
            try { localStorage.removeItem(SESSION_STORAGE_KEY) } catch (e) { /* ignore */ }
            return ''
        })
    }, [])

    // Reset balance to initial
    const resetBalance = useCallback(() => {
        updateBalance(INITIAL_BALANCE)
        clearDemoSession()
        setTransactions([{
            id: Date.now(),
            type: 'reset',
            amount: INITIAL_BALANCE,
            balance: INITIAL_BALANCE,
            timestamp: new Date(),
        }])
    }, [clearDemoSession, updateBalance])

    const value = {
        balance,
        currency,
        setCurrency,
        activeSessionId,
        transactions,
        placeBet,
        addWinnings,
        redeemDemoCredits,
        clearDemoSession,
        resetBalance,
        updateBalance,
        toasts,
        showToast,
    }

    return (
        <WalletContext.Provider value={value}>
            {children}
        </WalletContext.Provider>
    )
}

export function useWallet() {
    const context = useContext(WalletContext)
    if (!context) {
        throw new Error('useWallet must be used within a WalletProvider')
    }
    return context
}

export default WalletContext
