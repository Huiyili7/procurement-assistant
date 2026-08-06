import { capabilityClient } from '@lark-apaas/client-toolkit';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { ProcurementInfoStructuredExtractionOneInput, ProcurementInfoStructuredExtractionOneOutput, ProcurementScreenshotInfoExtractionOneInput, ProcurementScreenshotInfoExtractionOneOutput } from '@shared/plugin-types';

const EXTRACTION_PLUGIN_ID = 'procurement_info_structured_extraction_1';
const SCREENSHOT_PLUGIN_ID = 'procurement_screenshot_info_extraction_1';

let pluginLoaded = false;
let screenshotPluginLoaded = false;

async function ensurePluginLoaded() {
  if (!pluginLoaded) {
    try {
      await capabilityClient.load(EXTRACTION_PLUGIN_ID);
      pluginLoaded = true;
    } catch (err) {
      logger.error('采购信息结构化提取插件加载失败:', String(err));
      throw err;
    }
  }
}

export async function extractProcurementInfo(
  conversationContent: string,
): Promise<ProcurementInfoStructuredExtractionOneOutput | null> {
  try {
    await ensurePluginLoaded();
    const input: ProcurementInfoStructuredExtractionOneInput = {
      conversation_content: conversationContent,
    };
    const result = await capabilityClient
      .load(EXTRACTION_PLUGIN_ID)
      .call<ProcurementInfoStructuredExtractionOneOutput>('textToJson', input as unknown as Record<string, unknown>);
    return result;
  } catch (err) {
    logger.error('采购信息结构化提取失败:', String(err));
    return null;
  }
}

async function ensureScreenshotPluginLoaded() {
  if (!screenshotPluginLoaded) {
    try {
      await capabilityClient.load(SCREENSHOT_PLUGIN_ID);
      screenshotPluginLoaded = true;
    } catch (err) {
      logger.error('采购截图信息提取插件加载失败:', String(err));
      throw err;
    }
  }
}

export async function extractFromScreenshot(
  file: File,
): Promise<ProcurementScreenshotInfoExtractionOneOutput | null> {
  try {
    await ensureScreenshotPluginLoaded();
    const input = {
      procurement_screenshot: [file] as unknown as string[],
    };
    const result = await capabilityClient
      .load(SCREENSHOT_PLUGIN_ID)
      .call<ProcurementScreenshotInfoExtractionOneOutput>('imageToJson', input as unknown as Record<string, unknown>);
    return result;
  } catch (err) {
    logger.error('采购截图信息提取失败:', String(err));
    return null;
  }
}
