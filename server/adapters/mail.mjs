import { HttpError } from '../security.mjs';
export function createMailer(config) {
  if(config.mode==='demo')return {async send(){/* Local demo only: code is returned by the guarded API. No email/logging. */}};
  return {async send({email,code,challengeId}) {
    try {
      const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10_000),redirect:'error',headers:{Authorization:`Bearer ${config.resendKey}`,'Content-Type':'application/json','Idempotency-Key':`shop-otp-${challengeId}`},body:JSON.stringify({from:config.emailFrom,to:[email],subject:'[SoulTrace] 내 편지 확인을 위한 인증번호',text:`SoulTrace Memory Shop\n\n인증번호: ${code}\n\n10분 안에 원래 창에서 입력해주세요. 이 메일은 내 편지 불러오기를 요청하여 발송되었습니다. 본인이 요청하지 않았다면 무시하세요. 인증번호를 다른 사람과 공유하지 마세요.\n\n마케팅 수신 신청이나 새 회원가입은 이루어지지 않습니다.`})});
      if(!response.ok)throw new Error('Mail delivery rejected');
    }catch{throw new HttpError(503,'MAIL_UNAVAILABLE','확인 메일을 보내지 못했어요. 잠시 후 다시 시도해주세요.');}
  }};
}
