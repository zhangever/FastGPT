import type { NextApiRequest } from 'next';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ChatItemType } from '@/types/chat';
import { OpenApi, User } from '../mongo';
import { formatPrice } from '@/utils/user';
import { ERROR_ENUM } from '../errorCode';
import { countChatTokens } from '@/utils/tools';
import { ChatCompletionRequestMessageRoleEnum, ChatCompletionRequestMessage } from 'openai';
import { ChatModelEnum } from '@/constants/model';

/* 密码加密 */
export const hashPassword = (psw: string) => {
  return crypto.createHash('sha256').update(psw).digest('hex');
};

/* 生成 token */
export const generateToken = (userId: string) => {
  const key = process.env.TOKEN_KEY as string;
  const token = jwt.sign(
    {
      userId,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    },
    key
  );
  return token;
};

/* 校验 token */
export const authToken = (token?: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!token) {
      reject('缺少登录凭证');
      return;
    }
    const key = process.env.TOKEN_KEY as string;

    jwt.verify(token, key, function (err, decoded: any) {
      if (err || !decoded?.userId) {
        reject('凭证无效');
        return;
      }
      resolve(decoded.userId);
    });
  });
};

/* 校验 open api key */
export const authOpenApiKey = async (req: NextApiRequest) => {
  const { apikey: apiKey } = req.headers;

  if (!apiKey) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  try {
    const openApi = await OpenApi.findOne({ apiKey });
    if (!openApi) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }
    const userId = String(openApi.userId);

    // 余额校验
    const user = await User.findById(userId);
    if (!user) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }
    if (formatPrice(user.balance) <= 0) {
      return Promise.reject('Insufficient account balance');
    }

    // 更新使用的时间
    await OpenApi.findByIdAndUpdate(openApi._id, {
      lastUsedTime: new Date()
    });

    return {
      apiKey: process.env.OPENAIKEY as string,
      userId
    };
  } catch (error) {
    return Promise.reject(error);
  }
};

/* openai axios config */
export const axiosConfig = {
  httpsAgent: global.httpsAgent
};

/* delete invalid symbol */
const simplifyStr = (str: string) =>
  str
    .replace(/\n+/g, '\n') // 连续空行
    .replace(/[^\S\r\n]+/g, ' ') // 连续空白内容
    .trim();

/* 聊天内容 tokens 截断 */
export const openaiChatFilter = ({
  model,
  prompts,
  maxTokens
}: {
  model: `${ChatModelEnum}`;
  prompts: ChatItemType[];
  maxTokens: number;
}) => {
  // role map
  const map = {
    Human: ChatCompletionRequestMessageRoleEnum.User,
    AI: ChatCompletionRequestMessageRoleEnum.Assistant,
    SYSTEM: ChatCompletionRequestMessageRoleEnum.System
  };

  let rawTextLen = 0;
  const formatPrompts = prompts.map((item) => {
    const val = simplifyStr(item.value);
    rawTextLen += val.length;
    return {
      role: map[item.obj],
      content: val
    };
  });

  // 长度太小时，不需要进行 token 截断
  if (rawTextLen < maxTokens * 0.5) {
    return formatPrompts;
  }

  // 根据 tokens 截断内容
  const chats: ChatCompletionRequestMessage[] = [];
  let systemPrompt: ChatCompletionRequestMessage | null = null;

  //  System 词保留
  if (formatPrompts[0]?.role === 'system') {
    systemPrompt = formatPrompts.shift() as ChatCompletionRequestMessage;
  }

  let messages: { role: ChatCompletionRequestMessageRoleEnum; content: string }[] = [];

  // 从后往前截取对话内容
  for (let i = formatPrompts.length - 1; i >= 0; i--) {
    chats.unshift(formatPrompts[i]);

    messages = systemPrompt ? [systemPrompt, ...chats] : chats;

    const tokens = countChatTokens({
      model,
      messages
    });

    /* 整体 tokens 超出范围 */
    if (tokens >= maxTokens) {
      break;
    }
  }

  return messages;
};

/* system 内容截断. 相似度从高到低 */
export const systemPromptFilter = ({
  model,
  prompts,
  maxTokens
}: {
  model: 'gpt-4' | 'gpt-4-32k' | 'gpt-3.5-turbo';
  prompts: string[];
  maxTokens: number;
}) => {
  let splitText = '';

  // 从前往前截取
  for (let i = 0; i < prompts.length; i++) {
    const prompt = simplifyStr(prompts[i]);

    splitText += `${prompt}\n`;
    const tokens = countChatTokens({ model, messages: [{ role: 'system', content: splitText }] });
    if (tokens >= maxTokens) {
      break;
    }
  }

  return splitText.slice(0, splitText.length - 1);
};
