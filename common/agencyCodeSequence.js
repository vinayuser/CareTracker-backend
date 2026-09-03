const AgencyCodeCounterModel = require('../models/AgencyCodeCounterModel');

const isDuplicateKeyError = (err) => err?.code === 11000 || /duplicate key/i.test(String(err?.message || ''));

const parseTrailingNumber = (value) => {
  const match = String(value || '').match(/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
};

const peekMaxExistingNumber = async (DocModel, agencyId, codeField) => {
  if (!DocModel || !codeField) return 0;
  const latest = await DocModel.findOne({ agencyId })
    .sort({ [codeField]: -1 })
    .select(codeField)
    .lean();
  return parseTrailingNumber(latest?.[codeField]) || 0;
};

/**
 * Atomically allocate the next code number for an agency.
 * Numbers only increase — deleting documents does not free codes for reuse.
 *
 * On first use for a key, seeds from max(existing docs, startAt - 1) so
 * agencies with historical data continue past their current high-water mark.
 */
const allocateNextCode = async ({
  agencyId,
  key,
  prefix,
  existingModel = null,
  codeField = null,
  startAt = 10001,
  pad = 5,
}) => {
  if (!agencyId) throw new Error('agencyId is required to allocate a code');
  if (!key) throw new Error('sequence key is required');
  if (!prefix) throw new Error('code prefix is required');

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const counter = await AgencyCodeCounterModel.findOne({ agencyId, key }).lean();

    if (!counter) {
      const maxExisting = await peekMaxExistingNumber(existingModel, agencyId, codeField);
      const seed = Math.max(startAt - 1, maxExisting);
      try {
        await AgencyCodeCounterModel.create({
          agencyId,
          key,
          lastNumber: seed,
        });
      } catch (err) {
        if (!isDuplicateKeyError(err)) throw err;
        // Another request created the counter — fall through to $inc
      }
    }

    const updated = await AgencyCodeCounterModel.findOneAndUpdate(
      { agencyId, key },
      { $inc: { lastNumber: 1 } },
      { new: true },
    );

    if (updated?.lastNumber != null) {
      return `${prefix}-${String(updated.lastNumber).padStart(pad, '0')}`;
    }
  }

  throw new Error(`Failed to allocate ${prefix} code`);
};

module.exports = {
  allocateNextCode,
  isDuplicateKeyError,
  parseTrailingNumber,
};
