// ---- plugin:send_procurement_demand_feishu_notice_1 ----
// ============================================================
// 插件 send_procurement_demand_feishu_notice_1 (采购需求飞书通知) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface SendProcurementDemandFeishuNoticeOneInput {
  /** 操作类型（如新建、提交、审批通过等） */
  operate_type: string;
  /** 联系电话 */
  contact_phone?: string;
  /** 提报时间 */
  request_time: string;
  /** 采购需求详情页链接 */
  detail_url: string;
  /** 商品链接 */
  item_link: string;
  /** 收货地址 */
  delivery_address?: string;
  /** 采购需求编号 */
  demand_no: string;
  /** 采购截图链接（可选） */
  screenshot_url?: string;
  /** 操作人姓名 */
  operator: string;
  /** 接收人用户ID列表（采购执行人和需求提报人） */
  receiver_users: string[];
  /** 物料信息（如名称、规格、数量等） */
  material_info: string;
  /** 提报人姓名 */
  requester: string;
  /** 所属项目信息 */
  project_info: string;
}

/**
 * capabilityClient.load('send_procurement_demand_feishu_notice_1').call<SendProcurementDemandFeishuNoticeOneOutput>('send_feishu_message', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { success } = result;
 */
export interface SendProcurementDemandFeishuNoticeOneOutput {
  /** [object Object] */
  success: boolean;
}
// ---- end:send_procurement_demand_feishu_notice_1 ----

// ---- plugin:procurement_info_structured_extraction_1 ----
// ============================================================
// 插件 procurement_info_structured_extraction_1 (采购信息结构化提取) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface ProcurementInfoStructuredExtractionOneInput {
  /** 包含采购信息的用户对话内容 */
  conversation_content: string;
}

/**
 * capabilityClient.load('procurement_info_structured_extraction_1').call<ProcurementInfoStructuredExtractionOneOutput>('textToJson', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { itemQuantity, projectCode, projectPurpose, ... } = result;
 */
export interface ProcurementInfoStructuredExtractionOneOutput {
  /** 采购数量，需要采购的商品数量 */
  itemQuantity: number;
  /** 项目代号，采购所属项目的编号或代码 */
  projectCode: string;
  /** 具体用途，采购的商品或服务的具体使用用途说明 */
  projectPurpose: string;
  /** 收货地址，商品需要送达的具体地址 */
  deliveryAddress: string;
  /** 物料的通用名称/类别名称，如'轴承'、'O型圈'、'螺丝'、'传感器'等。注意：如果用户只提到了规格型号（如'SKF 6204-2RS'）而没有说明物料的通用名称/类别，则itemName应返回空字符串''，不要把规格型号当作物料名称。例如'要买10个SKF 6204-2RS'中itemName应为空，itemBrandModel才是'SKF 6204-2RS' */
  itemName: string;
  /** 商品链接，采购商品的购买链接或参考链接 */
  itemLink: string;
  /** 特殊要求，采购过程中需要特别说明的其他要求 */
  specialRequirements: string;
  /** 商品的品牌和具体型号，如'SKF 6204-2RS'、'白色硅胶O型圈'等。这是商品的规格标识信息，不是通用名称。当用户提到'SKF 6204-2RS'这样的型号信息时，应归入此字段而非itemName */
  itemBrandModel: string;
}
// ---- end:procurement_info_structured_extraction_1 ----

// ---- plugin:send_procurement_transfer_manual_notice_1 ----
// ============================================================
// 插件 send_procurement_transfer_manual_notice_1 (采购需求转人工时通知经办人) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface SendProcurementTransferManualNoticeOneInput {
  /** 采购需求编号 */
  procurement_no: string;
  /** 采购物料信息 */
  procurement_material: string;
  /** 采购所属项目 */
  procurement_project: string;
  /** 需求提报人用户ID */
  submiter_id: string;
  /** 对话历史记录 */
  conversation_history: string;
  /** 转人工处理的原因 */
  transfer_reason: string;
}

/**
 * capabilityClient.load('send_procurement_transfer_manual_notice_1').call<SendProcurementTransferManualNoticeOneOutput>('send_feishu_message', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { success } = result;
 */
export interface SendProcurementTransferManualNoticeOneOutput {
  /** [object Object] */
  success: boolean;
}
// ---- end:send_procurement_transfer_manual_notice_1 ----

// ---- plugin:procurement_feishu_group_create_1 ----
// ============================================================
// 插件 procurement_feishu_group_create_1 (采购需求转人工时自动创建飞书群组) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface ProcurementFeishuGroupCreateOneInput {
  /** 需求提报人的飞书用户ID */
  requester_id: string;
  /** 采购经办人的飞书用户ID */
  handler_id: string;
  /** 入群欢迎消息，可包含采购需求相关提示信息 */
  welcome_message?: string;
  /** 飞书群组名称，建议格式：采购需求-{{需求编号}}沟通群 */
  group_name: string;
  /** 群组描述，说明群组用途和相关采购需求信息 */
  group_description?: string;
}

/**
 * capabilityClient.load('procurement_feishu_group_create_1').call<ProcurementFeishuGroupCreateOneOutput>('createGroup', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { groupID } = result;
 */
export interface ProcurementFeishuGroupCreateOneOutput {
  /** [object Object] */
  groupID: string;
}
// ---- end:procurement_feishu_group_create_1 ----

// ---- plugin:procurement_demand_sync_to_bitable_1 ----
// ============================================================
// 插件 procurement_demand_sync_to_bitable_1 (采购需求同步写入飞书多维表格) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface ProcurementDemandSyncToBitableOneAggregatequeryInput {
  /** [object Object] */
  pageSize?: number;
  /** [object Object] */
  sort?: {
    desc: boolean;
    fieldName: string;
  }[];
  /** [object Object] */
  filter?: {
    conjunction: string;
    conditions: {
      fieldName: string;
      operator: string;
      value: string[];
    }[];
  };
  /** [object Object] */
  expandArrayDimension?: boolean;
  /** [object Object] */
  dimensions?: string[];
  /** [object Object] */
  measures?: {
    aggregation: string;
    alias: string;
    fieldName: string;
  }[];
  /** [object Object] */
  pageToken?: string;
}

/**
 * capabilityClient.load('procurement_demand_sync_to_bitable_1').call<ProcurementDemandSyncToBitableOneAggregatequeryOutput>('aggregateQuery', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { pageToken, result, hasMore } = result;
 */
export interface ProcurementDemandSyncToBitableOneAggregatequeryOutput {
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  result: {

  }[];
  /** [object Object] */
  hasMore: boolean;
}

export interface ProcurementDemandSyncToBitableOneBatchaddrecordsInput {
  /** [object Object] */
  records: {
    record: {
      '数量': number;
      '价格': number;
      '归属项目': string;
      '具体用途': string;
      '需求编号': string;
      '日期': number;
      '申请人': number[];
      '购买内容': string;
      '购物平台': string;
      '物料种类': string;
      '库存核查': boolean;
      '期望到货时间': number;
      '收货地址': string;
    };
  }[];
}

/**
 * capabilityClient.load('procurement_demand_sync_to_bitable_1').call<ProcurementDemandSyncToBitableOneBatchaddrecordsOutput>('batchAddRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface ProcurementDemandSyncToBitableOneBatchaddrecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface ProcurementDemandSyncToBitableOneBatchupdaterecordsInput {
  /** [object Object] */
  records: {
    id: string;
    record: {
      '库存核查': boolean;
      '需求编号': string;
      '日期': number;
      '申请人': number[];
      '物料种类': string;
      '购买内容': string;
      '归属项目': string;
      '具体用途': string;
      '数量': number;
      '价格': number;
      '期望到货时间': number;
      '收货地址': string;
      '购物平台': string;
    };
  }[];
}

/**
 * capabilityClient.load('procurement_demand_sync_to_bitable_1').call<ProcurementDemandSyncToBitableOneBatchupdaterecordsOutput>('batchUpdateRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface ProcurementDemandSyncToBitableOneBatchupdaterecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface ProcurementDemandSyncToBitableOneDeleterecordsInput {
  /** [object Object] */
  recordIDs: string[];
}

/**
 * capabilityClient.load('procurement_demand_sync_to_bitable_1').call<ProcurementDemandSyncToBitableOneDeleterecordsOutput>('deleteRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { success } = result;
 */
export interface ProcurementDemandSyncToBitableOneDeleterecordsOutput {
  /** [object Object] */
  success: boolean;
}

export interface ProcurementDemandSyncToBitableOneGetrecordInput {
  /** [object Object] */
  recordID: string;
}

/**
 * capabilityClient.load('procurement_demand_sync_to_bitable_1').call<ProcurementDemandSyncToBitableOneGetrecordOutput>('getRecord', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { id, record } = result;
 */
export interface ProcurementDemandSyncToBitableOneGetrecordOutput {
  /** [object Object] */
  id: string;
  /** [object Object] */
  record?: {
    '价格': number;
    '库存核查': unknown;
    '期望到货时间': number;
    '收货地址': unknown;
    '购物平台': unknown;
    '申请人': number[];
    '购买内容': unknown;
    '数量': number;
    '归属项目': unknown;
    '具体用途': unknown;
    '需求编号': {
      text: string;
    };
    '日期': number;
    '物料种类': unknown;
  };
}

export interface ProcurementDemandSyncToBitableOneSearchrecordsInput {
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  pageSize?: number;
  /** [object Object] */
  fieldNames?: string[];
  /** [object Object] */
  sort?: {
    fieldName: string;
    desc: boolean;
  }[];
  /** [object Object] */
  filter?: {
    conditions: {
      operator: string;
      value: string[];
      fieldName: string;
    }[];
    conjunction: string;
  };
}

/**
 * capabilityClient.load('procurement_demand_sync_to_bitable_1').call<ProcurementDemandSyncToBitableOneSearchrecordsOutput>('searchRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { hasMore, pageToken, total, ... } = result;
 */
export interface ProcurementDemandSyncToBitableOneSearchrecordsOutput {
  /** [object Object] */
  hasMore: boolean;
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  total?: number;
  /** [object Object] */
  records: {
    id: string;
    record: {
      '具体用途': unknown;
      '库存核查': unknown;
      '需求编号': {
        text: string;
      };
      '日期': number;
      '申请人': number[];
      '物料种类': unknown;
      '购买内容': unknown;
      '购物平台': unknown;
      '数量': number;
      '价格': number;
      '归属项目': unknown;
      '期望到货时间': number;
      '收货地址': unknown;
    };
  }[];
}
// ---- end:procurement_demand_sync_to_bitable_1 ----

// ---- plugin:procurement_demand_write_to_bitable_1 ----
// ============================================================
// 插件 procurement_demand_write_to_bitable_1 (采购需求提交同步到飞书多维表格) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface ProcurementDemandWriteToBitableOneAggregatequeryInput {
  /** [object Object] */
  filter?: {
    conjunction: string;
    conditions: {
      fieldName: string;
      operator: string;
      value: string[];
    }[];
  };
  /** [object Object] */
  expandArrayDimension?: boolean;
  /** [object Object] */
  dimensions?: string[];
  /** [object Object] */
  measures?: {
    fieldName: string;
    aggregation: string;
    alias: string;
  }[];
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  pageSize?: number;
  /** [object Object] */
  sort?: {
    fieldName: string;
    desc: boolean;
  }[];
}

/**
 * capabilityClient.load('procurement_demand_write_to_bitable_1').call<ProcurementDemandWriteToBitableOneAggregatequeryOutput>('aggregateQuery', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { hasMore, pageToken, result } = result;
 */
export interface ProcurementDemandWriteToBitableOneAggregatequeryOutput {
  /** [object Object] */
  hasMore: boolean;
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  result: {

  }[];
}

export interface ProcurementDemandWriteToBitableOneBatchaddrecordsInput {
  /** [object Object] */
  records: {
    record: {
      '申请人': string;
      '价格': string;
      '归属项目': string;
      '具体用途': string;
      '库存核查': boolean;
      '期望到货时间': number;
      '日期': number;
      '物料种类': string;
      '购买内容': string;
      '数量': string;
      '收货地址': string;
      '购物平台': string;
      '需求编号': string;
    };
  }[];
}

/**
 * capabilityClient.load('procurement_demand_write_to_bitable_1').call<ProcurementDemandWriteToBitableOneBatchaddrecordsOutput>('batchAddRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface ProcurementDemandWriteToBitableOneBatchaddrecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface ProcurementDemandWriteToBitableOneBatchupdaterecordsInput {
  /** [object Object] */
  records: {
    id: string;
    record: {
      '需求编号': string;
      '日期': number;
      '申请人': string;
      '库存核查': boolean;
      '收货地址': string;
      '期望到货时间': number;
      '购物平台': string;
      '物料种类': string;
      '购买内容': string;
      '数量': string;
      '价格': string;
      '归属项目': string;
      '具体用途': string;
    };
  }[];
}

/**
 * capabilityClient.load('procurement_demand_write_to_bitable_1').call<ProcurementDemandWriteToBitableOneBatchupdaterecordsOutput>('batchUpdateRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface ProcurementDemandWriteToBitableOneBatchupdaterecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface ProcurementDemandWriteToBitableOneDeleterecordsInput {
  /** [object Object] */
  recordIDs: string[];
}

/**
 * capabilityClient.load('procurement_demand_write_to_bitable_1').call<ProcurementDemandWriteToBitableOneDeleterecordsOutput>('deleteRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { success } = result;
 */
export interface ProcurementDemandWriteToBitableOneDeleterecordsOutput {
  /** [object Object] */
  success: boolean;
}

export interface ProcurementDemandWriteToBitableOneGetrecordInput {
  /** [object Object] */
  recordID: string;
}

/**
 * capabilityClient.load('procurement_demand_write_to_bitable_1').call<ProcurementDemandWriteToBitableOneGetrecordOutput>('getRecord', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { record, id } = result;
 */
export interface ProcurementDemandWriteToBitableOneGetrecordOutput {
  /** [object Object] */
  record?: {
    '价格': unknown;
    '收货地址': unknown;
    '需求编号': {
      text: string;
    };
    '日期': number;
    '申请人': unknown;
    '物料种类': unknown;
    '购买内容': unknown;
    '数量': unknown;
    '归属项目': unknown;
    '具体用途': unknown;
    '库存核查': unknown;
    '期望到货时间': number;
    '购物平台': unknown;
  };
  /** [object Object] */
  id: string;
}

export interface ProcurementDemandWriteToBitableOneSearchrecordsInput {
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  pageSize?: number;
  /** [object Object] */
  fieldNames?: string[];
  /** [object Object] */
  sort?: {
    fieldName: string;
    desc: boolean;
  }[];
  /** [object Object] */
  filter?: {
    conjunction: string;
    conditions: {
      fieldName: string;
      operator: string;
      value: string[];
    }[];
  };
}

/**
 * capabilityClient.load('procurement_demand_write_to_bitable_1').call<ProcurementDemandWriteToBitableOneSearchrecordsOutput>('searchRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { total, records, hasMore, ... } = result;
 */
export interface ProcurementDemandWriteToBitableOneSearchrecordsOutput {
  /** [object Object] */
  total?: number;
  /** [object Object] */
  records: {
    id: string;
    record: {
      '库存核查': unknown;
      '期望到货时间': number;
      '日期': number;
      '申请人': unknown;
      '购买内容': unknown;
      '价格': unknown;
      '具体用途': unknown;
      '购物平台': unknown;
      '需求编号': {
        text: string;
      };
      '物料种类': unknown;
      '数量': unknown;
      '归属项目': unknown;
      '收货地址': unknown;
    };
  }[];
  /** [object Object] */
  hasMore: boolean;
  /** [object Object] */
  pageToken?: string;
}
// ---- end:procurement_demand_write_to_bitable_1 ----

// ---- plugin:procurement_screenshot_info_extraction_1 ----
// ============================================================
// 插件 procurement_screenshot_info_extraction_1 (采购截图信息结构化提取) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface ProcurementScreenshotInfoExtractionOneInput {
  /** 采购商品截图（如淘宝/京东商品页面截图） */
  procurement_screenshot: string[];
}

/**
 * capabilityClient.load('procurement_screenshot_info_extraction_1').call<ProcurementScreenshotInfoExtractionOneOutput>('imageToJson', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { packageSize, annotatedQuantity, purchasePortions, ... } = result;
 */
export interface ProcurementScreenshotInfoExtractionOneOutput {
  /** 每份包含的个数，如单份包装内含20个，此处填20，非必填，无法识别返回null */
  packageSize: number;
  /** 用户红框标注/红色箭头指向的采购总数量，如用户标注需要1000个，此处填1000，非必填，无法识别返回null */
  annotatedQuantity: number;
  /** 采购份数，计算方式：采购总数量÷每份包含个数，如1000÷20=50，此处填50；若无法整除则向上取整，非必填，无法计算返回null */
  purchasePortions: number;
  /** 购买平台，如淘宝、京东、天猫、1688、拼多多等，从页面标识识别，无法识别返回空字符串 */
  platform: string;
  /** 物料的通用名称/类别名称，如O型圈、轴承、螺丝刀等，必填，无法识别返回空字符串 */
  itemName: string;
  /** 规格型号，如外径6×2.4mm、304不锈钢材质、M5×10mm等，必填，无法识别返回空字符串 */
  itemBrandModel: string;
}
// ---- end:procurement_screenshot_info_extraction_1 ----