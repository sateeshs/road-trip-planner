export interface BookingSummary {
  hotelId: string
  hotelName: string
  offerId: string
  roomType: string
  checkIn: string
  checkOut: string
  nights: number
  adults: number
  pricePerNight: number
  totalPrice: number
  currency: string
  cancellationPolicy: string
  breakfastIncluded: boolean
  bookingUrl: string
}

interface BookingReviewModalProps {
  summary: BookingSummary
  onClose: () => void
  onConfirm: () => void
}

export default function BookingReviewModal({ summary, onClose, onConfirm }: BookingReviewModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Review Booking</h2>
        <p className="text-xs text-gray-500 mb-4">You&apos;ll be redirected to the hotel site to complete payment.</p>

        <div className="bg-gray-50 rounded-xl p-4 space-y-2 mb-5">
          <div className="font-semibold text-gray-900">{summary.hotelName}</div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Room</span>
            <span>{summary.roomType}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Check-in</span>
            <span>{summary.checkIn}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Check-out</span>
            <span>{summary.checkOut}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Guests</span>
            <span>{summary.adults} adults</span>
          </div>
          <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between font-semibold">
            <span>Total ({summary.nights} night{summary.nights !== 1 ? 's' : ''})</span>
            <span>${summary.totalPrice.toFixed(2)} {summary.currency}</span>
          </div>
          <div className="text-xs text-gray-400">{summary.cancellationPolicy}</div>
          {summary.breakfastIncluded && (
            <div className="text-xs text-green-600 font-medium">&#10003; Breakfast included</div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Review &amp; Pay &rarr;
          </button>
        </div>
      </div>
    </div>
  )
}
