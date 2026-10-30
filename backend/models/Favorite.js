const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        venueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true },
    },
    { timestamps: true }
);

favoriteSchema.index({ userId: 1, venueId: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', favoriteSchema);
