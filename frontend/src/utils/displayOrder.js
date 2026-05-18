const getNumericValue = (value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

export const getCategoryDisplayOrder = (category, fallbackOrder = 999) => {
  const numericOrder = getNumericValue(category?.order);
  return numericOrder ?? fallbackOrder;
};

export const sortCategoriesByDisplayOrder = (categories = []) => {
  return [...categories].sort((a, b) => {
    const orderDifference = getCategoryDisplayOrder(a) - getCategoryDisplayOrder(b);
    if (orderDifference !== 0) {
      return orderDifference;
    }

    return (a?.name || '').localeCompare(b?.name || '');
  });
};

const getPilotStartOrder = (pilot) => {
  const numericOrder = getNumericValue(pilot?.startOrder);
  if (numericOrder === null) {
    return null;
  }

  // `999` is the app fallback for "no explicit start order".
  return numericOrder >= 999 ? null : numericOrder;
};

export const sortPilotsByDisplayOrder = (pilots = [], categories = []) => {
  const categoryOrderById = new Map(
    categories.map((category, index) => [category.id, getCategoryDisplayOrder(category, index + 1)])
  );

  return [...pilots].sort((a, b) => {
    const startOrderA = getPilotStartOrder(a);
    const startOrderB = getPilotStartOrder(b);

    if (startOrderA !== null && startOrderB !== null && startOrderA !== startOrderB) {
      return startOrderA - startOrderB;
    }

    if (startOrderA !== null && startOrderB === null) return -1;
    if (startOrderA === null && startOrderB !== null) return 1;

    const categoryOrderA = categoryOrderById.get(a?.categoryId) ?? Number.MAX_SAFE_INTEGER;
    const categoryOrderB = categoryOrderById.get(b?.categoryId) ?? Number.MAX_SAFE_INTEGER;

    if (categoryOrderA !== categoryOrderB) {
      return categoryOrderA - categoryOrderB;
    }

    return (a?.name || '').localeCompare(b?.name || '');
  });
};

const getStageTimingPriorityGroup = (status = '') => {
  switch (String(status || '').trim()) {
    case 'racing':
    case 'pre_start':
      return 0;
    case 'not_started':
      return 1;
    case 'finished':
      return 2;
    case 'retired':
      return 3;
    default:
      return 4;
  }
};

export const sortPilotsByStageTimingPriority = (items = [], categories = []) => {
  const categoryOrderById = new Map(
    categories.map((category, index) => [category.id, getCategoryDisplayOrder(category, index + 1)])
  );

  return [...items].sort((left, right) => {
    const leftGroup = getStageTimingPriorityGroup(left?.currentStatus || left?.status || left?.fixedStatus);
    const rightGroup = getStageTimingPriorityGroup(right?.currentStatus || right?.status || right?.fixedStatus);

    if (leftGroup !== rightGroup) {
      return leftGroup - rightGroup;
    }

    if (leftGroup === 0) {
      const leftStartAtMs = Number.isFinite(left?.startAtMs) ? left.startAtMs : Number.NEGATIVE_INFINITY;
      const rightStartAtMs = Number.isFinite(right?.startAtMs) ? right.startAtMs : Number.NEGATIVE_INFINITY;
      if (leftStartAtMs !== rightStartAtMs) {
        return rightStartAtMs - leftStartAtMs;
      }
    } else if (leftGroup === 1) {
      const leftStartAtMs = Number.isFinite(left?.startAtMs) ? left.startAtMs : Number.MAX_SAFE_INTEGER;
      const rightStartAtMs = Number.isFinite(right?.startAtMs) ? right.startAtMs : Number.MAX_SAFE_INTEGER;
      if (leftStartAtMs !== rightStartAtMs) {
        return leftStartAtMs - rightStartAtMs;
      }
    } else if (leftGroup === 2) {
      const leftFinishAtMs = Number.isFinite(left?.finishAtMs) ? left.finishAtMs : Number.MAX_SAFE_INTEGER;
      const rightFinishAtMs = Number.isFinite(right?.finishAtMs) ? right.finishAtMs : Number.MAX_SAFE_INTEGER;
      if (leftFinishAtMs !== rightFinishAtMs) {
        return leftFinishAtMs - rightFinishAtMs;
      }
    }

    const leftCategoryOrder = categoryOrderById.get(left?.pilot?.categoryId || left?.categoryId) ?? Number.MAX_SAFE_INTEGER;
    const rightCategoryOrder = categoryOrderById.get(right?.pilot?.categoryId || right?.categoryId) ?? Number.MAX_SAFE_INTEGER;
    if (leftCategoryOrder !== rightCategoryOrder) {
      return leftCategoryOrder - rightCategoryOrder;
    }

    const leftStartOrder = getNumericValue(left?.pilot?.startOrder ?? left?.startOrder);
    const rightStartOrder = getNumericValue(right?.pilot?.startOrder ?? right?.startOrder);
    if (leftStartOrder !== null && rightStartOrder !== null && leftStartOrder !== rightStartOrder) {
      return leftStartOrder - rightStartOrder;
    }

    return String(left?.pilot?.name || left?.name || '').localeCompare(String(right?.pilot?.name || right?.name || ''));
  });
};
