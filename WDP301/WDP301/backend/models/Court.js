const mongoose = require('mongoose');

const courtSchema = new mongoose.Schema(
    {
        venueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true },
        name: { type: String, required: [true, 'Vui lòng nhập tên sân'], trim: true },
        type: { type: String, required: true },
        size: { type: String, default: '' },
        surface: { type: String, default: '' },
        pricePerHour: { type: Number, required: true, min: 0 },
        status: { type: String, enum: ['active', 'inactive', 'maintenance'], default: 'active' },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Court', courtSchema);
