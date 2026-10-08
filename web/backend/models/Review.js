const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
    {
        venueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        rating: { type: Number, required: true, min: 1, max: 5 },
        comment: { type: String, default: '' },
        helpful: { type: Number, default: 0 },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Review', reviewSchema);
