const Block = require('../models/Block');

async function getBlockedUserIds(userId) {
  const relationships = await Block.find({
    $or: [{ blockerId: userId }, { blockedId: userId }],
  }, 'blockerId blockedId -_id').lean();

  return relationships.map((item) => (item.blockerId === userId ? item.blockedId : item.blockerId));
}

async function getBlockState(viewerUserId, targetUserId) {
  if (!viewerUserId || !targetUserId || viewerUserId === targetUserId) {
    return { hasBlocked: false, blockedByUser: false, blockedBetween: false };
  }

  const docs = await Block.find({
    $or: [
      { blockerId: viewerUserId, blockedId: targetUserId },
      { blockerId: targetUserId, blockedId: viewerUserId },
    ],
  }, 'blockerId blockedId -_id').lean();

  const hasBlocked = docs.some((item) => item.blockerId === viewerUserId && item.blockedId === targetUserId);
  const blockedByUser = docs.some((item) => item.blockerId === targetUserId && item.blockedId === viewerUserId);

  return {
    hasBlocked,
    blockedByUser,
    blockedBetween: hasBlocked || blockedByUser,
  };
}

async function isBlockedBetween(userA, userB) {
  const state = await getBlockState(userA, userB);
  return state.blockedBetween;
}

module.exports = {
  getBlockedUserIds,
  getBlockState,
  isBlockedBetween,
};
