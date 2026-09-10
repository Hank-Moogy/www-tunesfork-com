function isResourceAlreadyExistsResponse(status, body) {
  return Number(status) === 409 && /resource already exists/i.test(String(body ?? ""));
}

function isResourceAlreadyExistsError(error) {
  let responseStatus = null;
  let responseBody = "";
  try { responseStatus = error?.originalResponse?.getStatus?.(); } catch {}
  try { responseBody = error?.originalResponse?.getBody?.() ?? ""; } catch {}
  const status = responseStatus ?? error?.statusCode ?? error?.status;
  const detail = `${responseBody} ${error?.message ?? ""}`;
  return isResourceAlreadyExistsResponse(status, detail);
}

module.exports = { isResourceAlreadyExistsError, isResourceAlreadyExistsResponse };
