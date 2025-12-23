const Mission = require("../models/mission")
const asyncHandler = require("express-async-handler");
const Counter = require("../models/counter");

//Counter 
async function getNextSequenceValue(sequenceName) {
    const sequenceDocument = await Counter.findOneAndUpdate(
        { _id: sequenceName },
        { $inc: { seq: 1 } },
        { new: true, upsert: true },
    )
    return sequenceDocument.seq
}

//Get All mission

const getAllMission = asyncHandler(async (req, res) => {
    const mission = await Mission.find(req.params.id);
    res.json({
        success: true,
        data: mission
    })
})
const getMissionByID = asyncHandler(async (req, res) => {
    const mission = await Mission.findById(req.params.id);
    if (!mission) return
    res.status(404).json({
        success: false,
        message: "Event not found"
    })
    res.json({
        success: true,
        data: mission
    })
})
//Create mission

const createMission = asyncHandler(async (req, res) => {
    const sequenceValue = await getNextSequenceValue("mission_id");
    const newMissionId = "MIS-" + String(sequenceValue).padStart(4, "0");
    const mission = new Mission({
        ...req.body,
        mission_id: newMissionId
    })
    await mission.save();

    res.status(201).json({
        success: true,
        data: mission,
    })
})

//Update event 

const updateMission = asyncHandler(async (req, res) => {
    const mission = await Mission.findOneAndUpdate(
        { mission_id: req.params.id },
        req.body,
        { new: true }
    );
    if (!mission) return res.status(404).json({
        success: false,
        message: "Mission not found"
    })
    res.json({
        success: true,
        data: mission
    })
})
const deleteMission = asyncHandler(async (req, res) => {
    const mission = await Mission.findByIdAndDelete(req.params.id);
    if (!mission) return res.status(404).json({ success: false, message: "Event not found" })
    res.json({
        success: true,
        message: "Mission deleted"
    })
})

module.exports = {
    getAllMission,
    getMissionByID,
    createMission,
    updateMission,
    deleteMission,
}