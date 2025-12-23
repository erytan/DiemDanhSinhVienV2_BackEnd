const { notFound, errHandler } = require('../middlewares/errHandler')

const userRouter = require('./user')
const courseRouter = require('./course')
const classRouter = require('./class')
const sesisonRouter = require('./session')
const missionRouter = require('./mission')
const documentRouter = require('./document')
const initRoutes = (app) => {
    app.use('/api/user', userRouter)
    app.use('/api/course',courseRouter)
    app.use('/api/class',classRouter)
    app.use('/api/session',sesisonRouter)
    app.use('/api/mission',missionRouter)
    app.use('/api/document',documentRouter)

    app.use(notFound)
    app.use(errHandler)
}
module.exports = initRoutes