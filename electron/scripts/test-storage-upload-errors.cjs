const assert = require("node:assert/strict");
const test = require("node:test");
const {
  isResourceAlreadyExistsError,
  isResourceAlreadyExistsResponse,
} = require("../storage-upload-errors.cjs");

test("recognizes the Supabase orphan collision response", () => {
  assert.equal(isResourceAlreadyExistsResponse(409, '{"message":"The resource already exists"}'), true);
  assert.equal(isResourceAlreadyExistsResponse(500, "The resource already exists"), false);
  assert.equal(isResourceAlreadyExistsResponse(409, "authorization failed"), false);
});

test("recognizes a tus detailed collision error", () => {
  const error = {
    message: "unexpected response while creating upload",
    originalResponse: {
      getStatus: () => 409,
      getBody: () => '{"message":"The resource already exists"}',
    },
  };
  assert.equal(isResourceAlreadyExistsError(error), true);
  assert.equal(isResourceAlreadyExistsError(new Error("The resource already exists")), false);
});
