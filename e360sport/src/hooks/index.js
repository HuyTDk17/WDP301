import { useState, useEffect, useCallback, useRef } from 'react'

export function useFetch(fetchFn, deps = [], options = {}) {
  const { immediate = true, initialData = null } = options
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(immediate)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const execute = useCallback(async (...args) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchFn(...args)
      if (mountedRef.current) setData(result)
      return result
    } catch (err) {
      if (mountedRef.current) setError(err)
      throw err
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, deps)

  useEffect(() => {
    if (immediate) execute()
  }, [execute])

  return { data, loading, error, execute, setData }
}

export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function useClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (e) => {
      if (!ref.current || ref.current.contains(e.target)) return
      handler(e)
    }
    document.addEventListener('mousedown', listener)
    return () => document.removeEventListener('mousedown', listener)
  }, [ref, handler])
}

export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : initialValue
    } catch { return initialValue }
  })

  const setStoredValue = useCallback((val) => {
    const toStore = typeof val === 'function' ? val(value) : val
    setValue(toStore)
    localStorage.setItem(key, JSON.stringify(toStore))
  }, [key, value])

  return [value, setStoredValue]
}

export function usePagination(total, pageSize = 10) {
  const [page, setPage] = useState(1)
  const totalPages = Math.ceil(total / pageSize)
  const canPrev = page > 1
  const canNext = page < totalPages

  return {
    page, totalPages, canPrev, canNext,
    goTo: setPage,
    prev: () => canPrev && setPage(p => p - 1),
    next: () => canNext && setPage(p => p + 1),
    offset: (page - 1) * pageSize,
    limit: pageSize,
  }
}
