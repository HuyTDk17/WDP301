import { createContext, useContext, useState, useCallback } from 'react'

const BookingContext = createContext(null)

const initialState = {
  venue: null,        // { _id, name, address, images, ... }
  court: null,        // { _id, name, type, pricePerHour, ... }
  date: null,         // 'YYYY-MM-DD'
  slot: null,         // { start, end } — MỘT khung giờ cố định đã chọn
  sport: null,
  players: 1,
  notes: '',
  hold: null,         // { holdId, expiresAt } — trả về từ bookingService.holdSlot()
  booking: null,       // booking thật sau khi tạo (status: awaiting_payment)
  pricePerHour: 0,
  serviceFee: 0,
  totalAmount: 0,
}

export function BookingProvider({ children }) {
  const [booking, setBookingState] = useState(initialState)

  const setVenue = useCallback((venue) => setBookingState(prev => ({ ...prev, venue })), [])
  const setCourt = useCallback((court) => setBookingState(prev => ({ ...prev, court, pricePerHour: court?.pricePerHour || 0 })), [])
  const setDate = useCallback((date) => setBookingState(prev => ({ ...prev, date, slot: null })), [])
  const setSlot = useCallback((slot) => setBookingState(prev => ({ ...prev, slot })), [])
  const setSport = useCallback((sport) => setBookingState(prev => ({ ...prev, sport })), [])
  const setPlayers = useCallback((players) => setBookingState(prev => ({ ...prev, players })), [])
  const setNotes = useCallback((notes) => setBookingState(prev => ({ ...prev, notes })), [])

  /** Lưu kết quả giữ chỗ tạm — gọi ngay sau khi bookingService.holdSlot() thành công. */
  const setHold = useCallback((hold) => setBookingState(prev => ({ ...prev, hold })), [])

  /** Lưu booking thật sau khi tạo — gọi sau khi bookingService.createBooking() thành công. */
  const setBookingResult = useCallback((bookingResult) => setBookingState(prev => ({ ...prev, booking: bookingResult })), [])

  const setPricing = useCallback((pricePerHour, serviceFee, totalAmount) =>
    setBookingState(prev => ({ ...prev, pricePerHour, serviceFee, totalAmount })), [])

  const reset = useCallback(() => setBookingState(initialState), [])

  return (
    <BookingContext.Provider value={{
      booking, setVenue, setCourt, setDate, setSlot, setSport, setPlayers, setNotes,
      setHold, setBookingResult, setPricing, reset,
    }}>
      {children}
    </BookingContext.Provider>
  )
}

export function useBooking() {
  const ctx = useContext(BookingContext)
  if (!ctx) throw new Error('useBooking must be inside BookingProvider')
  return ctx
}
