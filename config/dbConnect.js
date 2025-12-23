const {default: mongoose} = require ('mongoose')
mongoose.set ('strictQuery',false);

const dbConnect = async()=>{
    try{
        const conn= await mongoose.connect(process.env.MONGODB_URI);
        if(conn.connection.readyState==1){
            console.log("MongoDB connected successfully");
        }else{
            console.log("MongoDb connection failed");
        }
    }
    catch(error)
    {
        console.log("Error in Db connection",err);
    }
}
module.exports=dbConnect