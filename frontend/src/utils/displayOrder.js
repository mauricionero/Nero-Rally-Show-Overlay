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
