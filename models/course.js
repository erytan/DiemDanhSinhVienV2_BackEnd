const mongoose= require("mongoose");
const {Schema} = mongoose;

const courseSchema = new Schema({
    course_id:{
        type:String,
        required:true,
    },
    name:{
        type: String,
        required:true,
    },
    user_id:{
        type: Schema.Types.ObjectId,
        required:true,
        ref:'users',
    },
});

module.exports=mongoose.model("course",courseSchema )