import { Router, type IRouter } from "express";
import healthRouter from "./health";
import whatsappRouter from "./whatsapp";
import scanRouter from "./scan";
import botRouter from "./bot";

const router: IRouter = Router();

router.use(healthRouter);
router.use(whatsappRouter);
router.use(scanRouter);
router.use(botRouter);

export default router;
