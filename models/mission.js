const mongoose = require("mongoose");
const { Schema } = mongoose;

const eventSchema = new Schema({
    mission_id: {
        type: String,
        required: true,
        unique: true,
    },
    title: {
        type: String,
        required: true,
    },
    start: {
        type: Date,
        required: true,
    },
    end: {
        type: Date,
    },
    extendedProps: {
        calendar: {
            type: String,
            enum: ["Danger", "Success", "Primary", "Warning"],
            required: true,
        },
        description: {
            type: String,
        },
        location: {
            type: String,
        }
    },
})
//Index để query nhanh theo ngày và loại calendar
eventSchema.index({
    start:1 ,"extendedProps.calendar":1
});

module.exports = mongoose.model("Mission", eventSchema);
