import { Configuration, OpenAIApi } from 'openai';
import { Chat, Model } from '../mongo';
import type { ModelSchema } from '@/types/mongoSchema';
import { authToken } from './tools';
import { getOpenApiKey } from './openai';
import type { ChatItemType } from '@/types/chat';
import mongoose from 'mongoose';

export const getOpenAIApi = (apiKey: string) => {
  const configuration = new Configuration({
    apiKey,
    basePath: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  });

  return new OpenAIApi(configuration);
};

// 模型使用权校验
export const authModel = async (modelId: string, userId: string) => {
  // 获取 model 数据
  const model = await Model.findById<ModelSchema>(modelId);
  if (!model) {
    return Promise.reject('模型不存在');
  }
  // 凭证校验
  if (userId !== String(model.userId)) {
    return Promise.reject('无权使用该模型');
  }
  return { model };
};

// 获取对话校验
export const authChat = async ({
  modelId,
  chatId,
  authorization
}: {
  modelId: string;
  chatId: '' | string;
  authorization?: string;
}) => {
  const userId = await authToken(authorization);

  // 获取 model 数据
  const { model } = await authModel(modelId, userId);

  // 聊天内容
  let content: ChatItemType[] = [];

  if (chatId) {
    // 获取 chat 数据
    content = await Chat.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(chatId) } },
      { $unwind: '$content' },
      { $match: { 'content.deleted': false } },
      {
        $project: {
          obj: '$content.obj',
          value: '$content.value'
        }
      }
    ]);
  }

  // 获取 user 的 apiKey
  const { userApiKey, systemKey } = await getOpenApiKey(userId);

  return {
    userApiKey,
    systemKey,
    content,
    userId,
    model
  };
};
