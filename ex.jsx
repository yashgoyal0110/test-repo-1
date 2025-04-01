import { useState, useEffect, useRef, useCallback } from 'react';
import {
  TextField,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Autocomplete,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  FormControl,
  IconButton,
  Box,
  Typography,
  Grid,
  Paper,
} from '@mui/material';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Delete } from '@mui/icons-material';
import axios from 'axios';
import ShoppingCart from '@mui/icons-material/ShoppingCart';
import { useApp } from '../AppContext';
import dayjs from 'dayjs';
import RefreshIcon from '@mui/icons-material/Refresh';

import { BASE_URL } from '../constants';
import CartValueLoader from './CartValueLoader';
import Loader from './Loader';

const WithdrawForm = () => {
  const [loader, setLoader] = useState(false);
  const [dialogLoader, setDialogLoader] = useState(false);
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [productDetails, setProductDetails] = useState([]);
  const [selectedQuantities, setSelectedQuantities] = useState({});
  const [distributors, setDistributors] = useState([]);
  const [selectedDistributor, setSelectedDistributor] = useState(null);
  const [totalUnits, setTotalUnits] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [withdrawnQuantities, setWithdrawnQuantities] = useState({});
  const { loginUserId, loginUserName } = useApp();
  const [isFirstProductDeleted, setIsFirstProductDeleted] = useState(false);
  const [availableCash, setAvailableCash] = useState(0);
  const [requiredCash, setRequiredCash] = useState(0);

  const fetchAvailableCash = useCallback(async () => {
    if (selectedDistributor) {
      try {
        const response = await axios.get(
          `${BASE_URL}/api/accounts/${selectedDistributor.code}`,
          {
            withCredentials: true,
          },
        );
        setAvailableCash(response.data);
      } catch (error) {
        return error.message;
      }
    } else {
      setAvailableCash(0);
    }
  }, [selectedDistributor]);

  useEffect(() => {
    fetchAvailableCash();
  }, [fetchAvailableCash]);

  useEffect(() => {
    axios
      .get(`${BASE_URL}/api/inventory/withdrawableProducts`, {
        withCredentials: true,
      })
      .then((response) => {
        setProducts(response.data);
      })
      .catch((error) => alert(error.message));
  }, []);

  const isInitialMount = useRef(true);
  const prevCartState = useRef(null); // To store previous cart state

  // Fetch cart data on component mount

  useEffect(() => {
    const fetchCart = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/api/cart/get`, {
          params: { distributorCode: loginUserId },
          withCredentials: true,
        });

        const {
          items,
          totalUnits,
          totalAmount,
          selectedDistributor,
          requiredCash,
        } = response.data;

        setRows(items || []);
        setTotalUnits(totalUnits);
        setTotalAmount(totalAmount || 0);
        setRequiredCash(requiredCash || 0);
        if (selectedDistributor) {
          setSelectedDistributor((prev) => ({
            ...prev,
            code: selectedDistributor,
          }));
        }

        prevCartState.current = JSON.stringify({
          items,
          totalUnits,
          totalAmount,
        });
      } catch (error) {
        alert('Error fetching cart');
        return error.message;
      }
    };

    fetchCart();
  }, []);

  // Update cart when data changes, but prevent unnecessary API calls
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return; // Prevent first render from triggering addToCart
    }

    const addToCart = async () => {
      try {
        setLoader(true);
        const payload = {
          items: rows,
          selectedDistributor: selectedDistributor?.code || null,
        };
        const newCartState = JSON.stringify(payload);
        if (prevCartState.current === newCartState) return; // Avoid redundant API calls

        const response = await axios.post(`${BASE_URL}/api/cart/add`, payload, {
          params: { distributorCode: loginUserId },
          withCredentials: true,
        });
        // Update state only if response data differs
        if (
          JSON.stringify(response.data.items) !== JSON.stringify(rows) ||
          response.data.totalUnits !== totalUnits ||
          response.data.totalAmount !== totalAmount ||
          response.data.requiredCash !== requiredCash
        ) {
          setRows(response.data.items);
          setTotalUnits(response.data.totalUnits);
          setTotalAmount(response.data.totalAmount);
          setRequiredCash(response.data.requiredCash);
        }

        prevCartState.current = JSON.stringify(response.data); // Update previous state
      } catch (error) {
        alert('Error updating cart');
        return error.message;
      } finally {
        setLoader(false);
      }
    };

    if (rows.length != 0 || isFirstProductDeleted) addToCart();
  }, [rows, selectedDistributor]);

  useEffect(() => {
    axios
      .get(`${BASE_URL}/api/distributors`, { withCredentials: true })
      .then((response) => {
        setDistributors(response.data);
      })
      .catch((error) => alert(error.message));
  }, []);

  const handleProductSelect = async (event, value) => {
    if (!value) return;
    setSelectedProduct(value);

    try {
      setDialogLoader(true);
      const response = await axios.get(
        `${BASE_URL}/api/inventory/grouped/${value}`,
        { withCredentials: true },
      );

      let productData = response.data
        .map((detail) => {
          const adjustedQty = avoidFalseQunantity(
            detail.productCode,
            detail.distributorCode,
            detail.expiryDate,
            detail.totalQty,
            rows,
          );

          return adjustedQty > 0 ? { ...detail, totalQty: adjustedQty } : null;
        })
        .filter(Boolean); // Removes null entries

      // Fetch price for direct ordering
      const priceResponse = await fetch(
        `${BASE_URL}/api/catalogues/price-by-product/${dayjs().format('YYYY-MM-DD')}/${value}`,
        { credentials: 'include' },
      );
      const priceData = await priceResponse.json();
      const price = priceData || 0;

      // Add an option to order directly
      const directOrderRow = {
        productCode: value,
        distributorCode: null,
        expiryDate: null,
        unitPrice: price,
        isDirectOrder: true,
      };

      if (productData.length > 0) {
        productData.push(directOrderRow); // Add direct order row
      } else {
        productData = [directOrderRow]; // Only direct order row
      }

      setProductDetails(productData);
      setDialogOpen(true);
    } catch (error) {
      alert('Failed to fetch product details. Please try again.');
      return error.message;
    } finally {
      setDialogLoader(false);
    }
  };

  const handleQuantityChange = (index, value) => {
    setSelectedQuantities((prev) => ({
      ...prev,
      [index]: value,
    }));
  };

  const handleCloseDialog = () => {
    const selectedRows = productDetails
      .map((detail, index) => {
        return {
          productCode: selectedProduct, // Store productCode globally
          expiryDate: detail.expiryDate,
          ownerCode: detail.distributorCode,
          qty: selectedQuantities[index] || 0,
          price: detail.unitPrice,
          total: (selectedQuantities[index] || 0) * detail.unitPrice,
        };
      })
      .filter((row) => row.qty > 0); // Only add non-zero quantities

    setRows((prevRows) => {
      const updatedRows = [...prevRows];

      selectedRows.forEach((newRow) => {
        const existingIndex = updatedRows.findIndex(
          (row) =>
            row.productCode === newRow.productCode &&
            row.ownerCode === newRow.ownerCode && // Fix: Match `ownerCode` correctly
            row.expiryDate === newRow.expiryDate, // Fix: Also match `expiryDate`
        );

        if (existingIndex !== -1) {
          // If row exists, update its qty and total
          updatedRows[existingIndex] = {
            ...updatedRows[existingIndex],
            qty: updatedRows[existingIndex].qty + newRow.qty,
          };
        } else {
          // Otherwise, add it as a new row
          updatedRows.push(newRow);
        }
      });

      return updatedRows;
    });

    // Update global withdrawn quantities
    setWithdrawnQuantities((prev) => {
      const updatedWithdrawals = { ...prev };
      selectedRows.forEach((row) => {
        const key = `${row.productCode}-${row.ownerCode}-${row.expiryDate}`;
        updatedWithdrawals[key] = (updatedWithdrawals[key] || 0) + row.qty;
      });
      return updatedWithdrawals;
    });

    // Close dialog and reset selected quantities
    setDialogOpen(false);
    setSelectedQuantities({});
  };

  const handleDeleteRow = (index) => {
    index === 0 && setIsFirstProductDeleted(true);
    setRows((prevRows) => {
      const rowToRemove = prevRows[index];
      const withdrawnKey = `${rowToRemove.productCode}-${rowToRemove.distributorCode}`;
      const updatedRows = prevRows.filter((_, i) => i !== index);

      // Restore withdrawn quantity
      setWithdrawnQuantities((prev) => {
        const updatedWithdrawals = { ...prev };
        updatedWithdrawals[withdrawnKey] = Math.max(
          0,
          (updatedWithdrawals[withdrawnKey] || 0) - rowToRemove.qty,
        );
        return updatedWithdrawals;
      });

      return updatedRows;
    });
  };

  const handleSubmit = async () => {
    if (!selectedDistributor?.code) {
      alert('Please select a distributor');
      return;
    }

    const payload = {
      totalAmt: totalAmount,
      totalUnits: totalUnits,
      withdrawBy: parseInt(loginUserId, 10),
      requiredCash: requiredCash,
      distributorCode: selectedDistributor.code, // the one who is withdrawing
      products: rows.map((row) => ({
        productCode: row.productCode,
        expiryDate: row.expiryDate,
        distributorCode: row.ownerCode,
        qty: row.qty,
        total: row.total?.toFixed(2),
        requiredCash: requiredCash,
        offerCataloguePrice: row.offerCataloguePrice, // offer price in oriflame catalogue for order-queue-purpose
        priceAfterExpiry: row.priceAfterExpiry,
        priceAfterDistributorDiscount: row.priceAfterDistributorDiscount,
      })),
    };

    try {
      setDialogLoader(true);
      const response = await axios.post(`${BASE_URL}/api/withdraws`, payload, {
        withCredentials: true,
      });

      if (response.status === 200 || response.status === 201) {
        toast.success(response.data.message);

        // Clear cart after withdrawal success
        await axios.delete(`${BASE_URL}/api/cart/clear`, {
          withCredentials: true,
        });

        // Reset state after successful withdrawal
        setRows([]);
        setTotalUnits(0);
        setTotalAmount(0);
        setWithdrawnQuantities({});
        setSelectedDistributor(null);
        setTotalAmount(0);
        toast.success(response.data.message);
        alert('Withdrawal successful');
        return;
      } else {
        toast.error('Withdrawal failed. Please try again.');
        throw new Error('Unexpected response from server');
      }
    } catch (error) {
      return alert(`Withdrawal failed: ${error.message}`);
    } finally {
      setDialogLoader(false);
    }
  };
  const avoidFalseQunantity = (
    productCode,
    distributorCode,
    expiryDate,
    quantity,
    rows,
  ) => {
    let product = rows.find(
      (row) =>
        row.productCode === productCode &&
        row.ownerCode === distributorCode &&
        row.expiryDate === expiryDate,
    );
    return product && product.qty !== undefined
      ? quantity - product.qty
      : quantity;
  };

  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />

      <Paper
        elevation={3}
        sx={{
          padding: 3,
          borderRadius: 2,
          backgroundColor: '#f8f9fa',
        }}
      >
        {/* Top Section with Filters */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={3}>
            <TextField
              label="Date"
              value={new Date().toISOString().split('T')[0]}
              disabled
              fullWidth
              variant="outlined"
              InputProps={{
                sx: { backgroundColor: 'white' },
              }}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              label="Order By"
              value={`${loginUserName} - ${loginUserId}`}
              disabled
              fullWidth
              variant="outlined"
              InputProps={{
                sx: { backgroundColor: 'white', fontWeight: 'bold' },
              }}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <Autocomplete
                options={distributors}
                getOptionLabel={(option) => option.code}
                value={selectedDistributor}
                onChange={(event, newValue) => {
                  setSelectedDistributor(newValue);
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Distributor"
                    fullWidth
                    variant="outlined"
                    InputProps={{
                      ...params.InputProps,
                      sx: { backgroundColor: 'white' },
                    }}
                  />
                )}
              />
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <Autocomplete
              options={products}
              getOptionLabel={(option) =>
                `${option.name} (${option.code})${option.inStock ? '' : ' *'}`
              } // Append * if not in inventory
              onChange={(event, newValue) =>
                handleProductSelect(event, newValue?.code)
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Product"
                  fullWidth
                  variant="outlined"
                  InputProps={{
                    ...params.InputProps,
                    sx: { backgroundColor: 'white' },
                  }}
                />
              )}
              renderOption={(props, option) => (
                <li {...props} key={option.code}>
                  {option.name} ({option.code})
                  {!option.inStock && <span style={{ color: 'red' }}>*</span>}
                </li>
              )}
            />

            <Typography
              variant="caption"
              sx={{ color: 'red', mt: 0.5, ml: 1, display: 'block' }}
            >
              Products marked with * are not currently in inventory.
            </Typography>
          </Grid>
        </Grid>

        {/* Selected Products Section */}
        <Paper
          elevation={1}
          sx={{
            mb: 4,
            overflow: 'hidden',
            display: rows.length > 0 ? 'block' : 'none',
            borderRadius: 1,
          }}
        >
          <Box sx={{ p: 2, backgroundColor: '#e3f2fd' }}>
            <Typography variant="h6" sx={{ fontWeight: 500 }}>
              Selected Products
            </Typography>
          </Box>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 'bold' }}>Product Code</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Expiry Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Owner Code</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Qty</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Price</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Total</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length > 0 &&
                rows.map((row, index) => (
                  <TableRow
                    key={index}
                    sx={{
                      '&:nth-of-type(odd)': { backgroundColor: '#fafafa' },
                      '&:hover': { backgroundColor: '#f1f8fe' },
                    }}
                  >
                    <TableCell>{row.productCode}</TableCell>
                    <TableCell>
                      {<TableCell>{row.expiryDate}</TableCell>}
                    </TableCell>
                    <TableCell>{row.ownerCode}</TableCell>
                    <TableCell>{row.qty}</TableCell>
                    <TableCell>
                      {loader ? <CartValueLoader /> : row.price?.toFixed(2)}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 'medium' }}>
                      {loader ? <CartValueLoader /> : row.total?.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <IconButton
                        onClick={() => handleDeleteRow(index)}
                        color="error"
                        size="small"
                        sx={{ '&:hover': { backgroundColor: '#ffebee' } }}
                      >
                        <Delete />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Paper>

        {/* Product Selection Dialog */}
        {dialogLoader ? (
          <Loader />
        ) : (
          <Dialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            maxWidth="md"
            fullWidth
            PaperProps={{
              sx: { borderRadius: 2 },
            }}
          >
            <DialogContent dividers>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                    <TableCell sx={{ fontWeight: 'bold' }}>
                      Expiry Date
                    </TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>
                      Owner Code
                    </TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Total Qty</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Price</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Qty</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {productDetails.map((detail, index) => (
                    <TableRow
                      key={index}
                      sx={{
                        backgroundColor: detail.isDirectOrder
                          ? '#e1e7f0'
                          : index % 2 === 0
                            ? '#fafafa'
                            : 'white',
                        fontWeight: detail.isDirectOrder ? 'bold' : 'normal',
                        '&:hover': { backgroundColor: '#f1f8fe' },
                      }}
                    >
                      <TableCell>
                        {detail.isDirectOrder
                          ? 'Order from Oriflame'
                          : detail.expiryDate !== null &&
                            new Date(detail.expiryDate).toLocaleDateString(
                              'en-GB',
                            )}
                      </TableCell>

                      <TableCell>
                        {detail.isDirectOrder ? '—' : detail.distributorCode}
                      </TableCell>

                      <TableCell>
                        {detail.isDirectOrder ? '—' : detail.totalQty}
                      </TableCell>

                      <TableCell>{detail.unitPrice?.toFixed(2)}</TableCell>

                      <TableCell>
                        <TextField
                          type="number"
                          inputProps={{
                            min: 0,
                            max: detail.totalQty,
                            placeholder: '0',
                          }}
                          value={selectedQuantities[index] || ''}
                          onChange={(e) =>
                            handleQuantityChange(index, Number(e.target.value))
                          }
                          error={selectedQuantities[index] > detail.totalQty}
                          helperText={
                            selectedQuantities[index] > detail.totalQty ? (
                              <span
                                style={{ fontSize: '10px', marginTop: '2px' }}
                              >
                                Cannot exceed total qty
                              </span>
                            ) : null
                          }
                          sx={{
                            '& .MuiInputBase-root': {
                              height: 36,
                              width: 80,
                              backgroundColor: 'white',
                            },
                            '& .MuiInputBase-input': { padding: '6px 8px' },
                            '& .MuiFormHelperText-root': {
                              fontSize: '10px',
                              lineHeight: '1.2',
                              margin: 0,
                              marginTop: '2px',
                            },
                          }}
                          variant="outlined"
                          size="small"
                        />
                      </TableCell>

                      {/* Total Price */}
                      <TableCell sx={{ fontWeight: 'medium' }}>
                        {(
                          (selectedQuantities[index] || 0) * detail.unitPrice
                        ).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DialogContent>
            <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
              <Button onClick={() => setDialogOpen(false)} variant="outlined">
                Cancel
              </Button>
              <Button
                onClick={handleCloseDialog}
                disabled={
                  Object.values(selectedQuantities).every((qty) => qty === 0) ||
                  Object.entries(selectedQuantities).some(
                    ([index, qty]) => qty > productDetails[index].totalQty,
                  )
                }
                variant="contained"
                startIcon={<ShoppingCart />}
              >
                Confirm Selection
              </Button>
            </DialogActions>
          </Dialog>
        )}

        {/* Total Summary */}
        <Paper
          elevation={2}
          sx={{ p: 3, borderRadius: 2, backgroundColor: '#f3f8ff' }}
        >
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                Total Quantity:{' '}
                <Box component="span" sx={{ fontWeight: 'bold' }}>
                  {loader ? <CartValueLoader /> : totalUnits}
                </Box>
              </Typography>
              {selectedDistributor && (
                <Typography
                  variant="body1"
                  sx={{
                    fontWeight: 'medium',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  Available Amount:{' '}
                  <Box component="span" sx={{ fontWeight: 'bold' }}>
                    ₹{loader ? <CartValueLoader /> : availableCash?.toFixed(2)}
                  </Box>
                  <IconButton size="small" onClick={fetchAvailableCash}>
                    <RefreshIcon fontSize="small" />
                  </IconButton>
                </Typography>
              )}
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                Total Amount:{' '}
                <Box component="span" sx={{ fontWeight: 'bold' }}>
                  ₹{loader ? <CartValueLoader /> : totalAmount?.toFixed(2)}
                </Box>
              </Typography>
              {selectedDistributor && rows.length > 0 && (
                <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                  Required Amount:{' '}
                  <Box component="span" sx={{ fontWeight: 'bold' }}>
                    ₹{loader ? <CartValueLoader /> : requiredCash?.toFixed(2)}
                  </Box>
                </Typography>
              )}
            </Grid>
            <Grid
              item
              xs={12}
              md={4}
              sx={{ textAlign: { xs: 'left', md: 'right' } }}
            >
              <Button
                variant="contained"
                color="primary"
                size="large"
                disabled={rows.length === 0 || requiredCash > availableCash}
                onClick={handleSubmit}
                startIcon={<ShoppingCart />}
                sx={{
                  borderRadius: 1.5,
                  px: 4,
                  boxShadow: 2,
                  backgroundColor: '#1976d2',
                  '&:hover': {
                    backgroundColor: '#1565c0',
                  },
                  '&:disabled': {
                    backgroundColor: '#e0e0e0',
                    color: '#9e9e9e',
                  },
                }}
              >
                COMPLETE PURCHASE
              </Button>
            </Grid>
          </Grid>
        </Paper>
      </Paper>
    </>
  );
};

export default WithdrawForm;
