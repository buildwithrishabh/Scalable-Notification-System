import { db } from "../../config/database.js";
import { logger } from "../../observability/logger.js";

export const registerDeviceToken = async (req , res , next) => {
    try {
        const userId = req.user.id;
        const { device_token , device_type = "WEB"} = req.body;

        const query = `
        insert into user_devices (user_id , device_token , device_type , is_active , updated_at)
        values ($1, $2, $3, true, NOW())
        on conflict (device_token)
        do update set
        user_id = excluded.user_id ,
        device_type = excluded.device_type,
        is_active = true,
        updated_at = NOW()
        RETURNING *;`;

        const result = await db.query(query , [userId , device_token , device_type]);
        logger.info(`[Device] Token registered for user ${userId}` , {userId , device_type});
    
        return res.status(200).json({
            success : true,
            message : "Device token registered successfully",
            data : result.rows[0]
        });

    }
    catch (error) {
        logger.error(`[Device] Failed to register device token` , { error: error.message });
        next(error);
        
    }
}