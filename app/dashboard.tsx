import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator, 
  Platform,
  Modal,
  Image,
  TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { FontAwesome, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import DateTimePickerModal from "react-native-modal-datetime-picker";
import DateTimePicker from '@react-native-community/datetimepicker';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import { router } from 'expo-router';

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  createdAt: Timestamp;
  total: number;
  items: OrderItem[];
  status: string;
  tableNumber?: number;
  customerName?: string;
  source?: string; // 'customer' or 'pos'
}

interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  minThreshold: number;
  expirationDate?: Date;
  shelfQuantity: number;
}

interface RestockHistory {
  date: string;
  quantity: number;
  expirationDate: string;
  totalPrice: number;
  damages?: number;
  staffName?: string;
  staffEmail?: string;
}

interface ConsumptionHistory {
  date: string;
  quantity: number;
  staffName?: string;
  staffEmail?: string;
  expirationDate?: string;
}

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  category: string;
  expirationDate?: string;
  restockHistory: RestockHistory[];
  consumptionHistory?: ConsumptionHistory[];
  totalValue: number;
  threshold: number;
  supplier: string;
}

interface DashboardData {
  totalSales: number;
  totalOrders: number;
  customerAppOrders: number;
  posAppOrders: number;
  topSellingItems: { name: string; quantity: number }[];
  salesByDate: { date: string; amount: number }[];
  lowStockItems: InventoryItem[];
  expiringItems: InventoryItem[];
}

export default function Dashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    totalSales: 0,
    totalOrders: 0,
    customerAppOrders: 0,
    posAppOrders: 0,
    topSellingItems: [],
    salesByDate: [],
    lowStockItems: [],
    expiringItems: []
  });
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [dateRangeError, setDateRangeError] = useState('');
  const [showWebStartPicker, setShowWebStartPicker] = useState(false);
  const [showWebEndPicker, setShowWebEndPicker] = useState(false);
  const [startDateText, setStartDateText] = useState('');
  const [endDateText, setEndDateText] = useState('');
  const [dateInputError, setDateInputError] = useState('');

  // Load data on initial render only, not on date changes
  useEffect(() => {
    loadDashboardData();
  }, []);

  // Initialize date text fields on component mount
  useEffect(() => {
    setStartDateText(formatDateForInput(startDate));
    setEndDateText(formatDateForInput(endDate));
  }, []);

  const loadDashboardData = async (customStartDate?: Date, customEndDate?: Date) => {
    try {
      // Use passed dates or state dates
      const dateRangeStart = customStartDate || new Date(startDate);
      const dateRangeEnd = customEndDate || new Date(endDate);
      
      const daysDifference = Math.floor((dateRangeEnd.getTime() - dateRangeStart.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDifference > 30) {
        setDateRangeError('Date range cannot exceed 30 days');
        return; // Prevent loading data if range is invalid
      }
      
      // Clear any previous date range errors
      setDateRangeError('');
      
      setIsLoading(true);
      
      // Set time to start of day for startDate and end of day for endDate
      const startDateTime = new Date(dateRangeStart);
      startDateTime.setHours(0, 0, 0, 0);
      const endDateTime = new Date(dateRangeEnd);
      endDateTime.setHours(23, 59, 59, 999);

      // Load orders data
      const ordersRef = collection(db, 'orders');
      const ordersQuery = query(
        ordersRef,
        where('createdAt', '>=', Timestamp.fromDate(startDateTime)),
        where('createdAt', '<=', Timestamp.fromDate(endDateTime))
      );

      const querySnapshot = await getDocs(ordersQuery);
      const orders: Order[] = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Order));

      // Calculate sales metrics
      const totalSales = orders.reduce((sum, order) => sum + (order.total || 0), 0);
      const totalOrders = orders.length;
      
      // Count orders by source
      const customerAppOrders = orders.filter(order => order.source === 'customer').length;
      const posAppOrders = orders.filter(order => order.source === 'pos').length;

      // Calculate top selling items
      const itemsMap = new Map<string, number>();
      orders.forEach(order => {
        order.items?.forEach((item: OrderItem) => {
          const currentQuantity = itemsMap.get(item.name) || 0;
          itemsMap.set(item.name, currentQuantity + item.quantity);
        });
      });

      const topSellingItems = Array.from(itemsMap.entries())
        .map(([name, quantity]) => ({ name, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      // Calculate sales by date
      const salesByDate = new Map<string, number>();
      orders.forEach(order => {
        if (order.createdAt) {
          const date = new Date(order.createdAt.seconds * 1000).toLocaleDateString();
          const currentAmount = salesByDate.get(date) || 0;
          salesByDate.set(date, currentAmount + (order.total || 0));
        }
      });

      const salesData = Array.from(salesByDate.entries())
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Load inventory data from the inventory collection
      const inventoryRef = collection(db, 'inventory');
      const inventorySnapshot = await getDocs(inventoryRef);
      const inventoryItems = inventorySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as InventoryItem[];

      // Get low stock items based on threshold
      const lowStockItems = inventoryItems.filter(
        item => item.quantity <= item.threshold
      );

      // Get items expiring in the next 7 days
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      
      // First get items with direct expirationDate field
      const expiringItems = inventoryItems.filter(item => {
        // Check direct expiration date if exists
        if (item.expirationDate) {
          const expiryDate = new Date(item.expirationDate);
          return expiryDate <= sevenDaysFromNow && expiryDate >= new Date();
        }
        
        // Also check restock history for expiration dates
        if (item.restockHistory && item.restockHistory.length > 0) {
          return item.restockHistory.some(history => {
            if (history.expirationDate) {
              const historyExpiryDate = new Date(history.expirationDate);
              return historyExpiryDate <= sevenDaysFromNow && historyExpiryDate >= new Date();
            }
            return false;
          });
        }
        
        return false;
      });

      setDashboardData({
        totalSales,
        totalOrders,
        customerAppOrders,
        posAppOrders,
        topSellingItems,
        salesByDate: salesData,
        lowStockItems,
        expiringItems
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('en-US', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString('en-US');
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Format date for the text input (YYYY-MM-DD)
  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Parse date from text input
  const parseDateFromInput = (dateText: string): Date | null => {
    // Check if the format is YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    
    if (!dateRegex.test(dateText)) {
      setDateInputError('Date must be in YYYY-MM-DD format');
      return null;
    }
    
    const date = new Date(dateText);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      setDateInputError('Invalid date');
      return null;
    }
    
    setDateInputError('');
    return date;
  };

  // Handle start date text change
  const handleStartDateTextChange = (text: string) => {
    setStartDateText(text);
    setDateInputError('');
  };

  // Handle end date text change
  const handleEndDateTextChange = (text: string) => {
    setEndDateText(text);
    setDateInputError('');
  };

  // Apply dates from text inputs - completely rewritten for better synchronization
  const applyDatesFromInput = () => {
    // Clear existing errors
    setDateInputError('');
    setDateRangeError('');
    
    try {
      // Validate input format
      if (!startDateText.match(/^\d{4}-\d{2}-\d{2}$/) || !endDateText.match(/^\d{4}-\d{2}-\d{2}$/)) {
        setDateInputError('Dates must be in YYYY-MM-DD format');
        return;
      }
      
      const newStartDate = new Date(startDateText);
      const newEndDate = new Date(endDateText);
      
      // Check if the dates are valid
      if (isNaN(newStartDate.getTime()) || isNaN(newEndDate.getTime())) {
        setDateInputError('Invalid date');
        return;
      }
      
      // Check if end date is before start date
      if (newEndDate < newStartDate) {
        setDateInputError('End date cannot be before start date');
        return;
      }
      
      // Check if date range exceeds 30 days
      const daysDifference = Math.floor((newEndDate.getTime() - newStartDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDifference > 30) {
        setDateInputError('Date range cannot exceed 30 days');
        return;
      }
      
      // First update the state dates
      setStartDate(newStartDate);
      setEndDate(newEndDate);
      
      // Then load dashboard data with the new dates directly
      // This avoids the state update delay issue
      loadDashboardData(newStartDate, newEndDate);
    } catch (error) {
      console.error('Error parsing dates:', error);
      setDateInputError('Invalid date format');
    }
  };

  const handleConfirmStartDate = (date: Date) => {
    const newStartDate = new Date(date);
    const currentEndDate = new Date(endDate);
    
    // If selected start date is after current end date, update end date to match
    if (date > currentEndDate) {
      setEndDate(date);
    }
    
    setStartDate(newStartDate);
    setShowStartPicker(false);
    setDateRangeError('');
    
    // Check if the new date range exceeds 30 days
    const daysDifference = Math.floor((currentEndDate.getTime() - newStartDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDifference > 30) {
      setDateRangeError('Date range cannot exceed 30 days');
    }
  };

  const handleConfirmEndDate = (date: Date) => {
    const newEndDate = new Date(date);
    const currentStartDate = new Date(startDate);
    
    // If selected end date is before current start date, update start date to match
    if (date < currentStartDate) {
      setStartDate(date);
    }
    
    setEndDate(newEndDate);
    setShowEndPicker(false);
    setDateRangeError('');
    
    // Check if the new date range exceeds 30 days
    const daysDifference = Math.floor((newEndDate.getTime() - currentStartDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDifference > 30) {
      setDateRangeError('Date range cannot exceed 30 days');
    }
  };

  const handleCancelStart = () => {
    setShowStartPicker(false);
  };

  const handleCancelEnd = () => {
    setShowEndPicker(false);
  };

  const handleToggleDatePicker = (pickerType: 'start' | 'end') => {
    if (Platform.OS === 'web') {
      if (pickerType === 'start') {
        setShowWebStartPicker(prev => !prev);
      } else {
        setShowWebEndPicker(prev => !prev);
      }
    } else {
      if (pickerType === 'start') {
        setShowStartPicker(true);
      } else {
        setShowEndPicker(true);
      }
    }
  };

  const handleWebDateChange = (event: any, selectedDate: Date | undefined, pickerType: 'start' | 'end') => {
    if (selectedDate) {
      if (pickerType === 'start') {
        handleConfirmStartDate(selectedDate);
        setShowWebStartPicker(false);
      } else {
        handleConfirmEndDate(selectedDate);
        setShowWebEndPicker(false);
      }
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <FontAwesome name="arrow-left" size={20} color="#333" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Dashboard</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.inventoryButton}
          onPress={() => setShowInventoryModal(true)}
        >
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
            <FontAwesome name="archive" size={18} color="#FFFFFF" />
            <Text style={styles.inventoryButtonText}>Inventory Summary</Text>
          </View>
          
          {(dashboardData.lowStockItems.length > 0 || dashboardData.expiringItems.length > 0) && (
            <View style={{
              position: 'absolute',
              top: -8,
              right: -8,
              backgroundColor: '#EF4444',
              width: 20,
              height: 20,
              borderRadius: 10,
              justifyContent: 'center',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#FFFFFF',
            }}>
              <Text style={{
                color: '#FFFFFF',
                fontSize: 10,
                fontWeight: 'bold',
              }}>
                {dashboardData.lowStockItems.length + dashboardData.expiringItems.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.datePickerContainer}>
        <View style={styles.dateRangeLabel}>
          <Ionicons name="time-outline" size={18} color="#F36514" />
          <Text style={styles.dateRangeText}>Date Range</Text>
        </View>
        
        {Platform.OS === 'web' ? (
          // Web platform - use text inputs
          <View style={styles.webDateInputContainer}>
            <View style={styles.dateInputGroup}>
              <Text style={styles.dateInputLabel}>From:</Text>
              <TextInput
                style={styles.dateInput}
                value={startDateText}
                onChangeText={handleStartDateTextChange}
                placeholder="YYYY-MM-DD"
                keyboardType="default"
              />
            </View>
            
            <View style={styles.dateInputGroup}>
              <Text style={styles.dateInputLabel}>To:</Text>
              <TextInput
                style={styles.dateInput}
                value={endDateText}
                onChangeText={handleEndDateTextChange}
                placeholder="YYYY-MM-DD"
                keyboardType="default"
              />
            </View>
            
            <TouchableOpacity 
              style={[styles.applyButton, (dateRangeError || dateInputError) ? styles.disabledButton : null]}
              onPress={applyDatesFromInput}
              disabled={!!(dateRangeError || dateInputError)}
            >
              <FontAwesome name="check-circle" size={18} color="#FFFFFF" />
              <Text style={styles.confirmButtonText}>Apply</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // Mobile/tablet platform - use the existing buttons and modal
          <View style={styles.dateButtonsContainer}>
            <TouchableOpacity 
              style={styles.dateButton}
              onPress={() => setShowStartPicker(true)}
            >
              <FontAwesome name="calendar" size={18} color="#F36514" />
              <Text style={styles.dateText}>From: {formatDate(startDate)}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.dateButton}
              onPress={() => setShowEndPicker(true)}
            >
              <FontAwesome name="calendar" size={18} color="#F36514" />
              <Text style={styles.dateText}>To: {formatDate(endDate)}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.confirmButton, dateRangeError ? styles.disabledButton : null]}
              onPress={() => loadDashboardData()}
              disabled={!!dateRangeError}
            >
              <FontAwesome name="check-circle" size={18} color="#FFFFFF" />
              <Text style={styles.confirmButtonText}>Confirm Date Range</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {dateRangeError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={16} color="#EF4444" />
            <Text style={styles.errorText}>{dateRangeError}</Text>
          </View>
        ) : null}
        
        {dateInputError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={16} color="#EF4444" />
            <Text style={styles.errorText}>{dateInputError}</Text>
          </View>
        ) : null}

        <DateTimePickerModal
          isVisible={showStartPicker}
          mode="date"
          onConfirm={handleConfirmStartDate}
          onCancel={handleCancelStart}
          date={startDate}
          maximumDate={endDate}
          buttonTextColorIOS="#4F46E5"
          themeVariant="light"
        />

        <DateTimePickerModal
          isVisible={showEndPicker}
          mode="date"
          onConfirm={handleConfirmEndDate}
          onCancel={handleCancelEnd}
          date={endDate}
          minimumDate={startDate}
          buttonTextColorIOS="#4F46E5"
          themeVariant="light"
        />
      </View>

      <ScrollView style={styles.content}>
        {/* Sales Statistics */}
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, styles.salesCard]}>
            <View style={styles.statIconContainer}>
              <MaterialCommunityIcons name="cash-multiple" size={24} color="#4F46E5" />
            </View>
            <View style={styles.statTextContainer}>
              <Text style={styles.statLabel}>Total Sales</Text>
              <Text style={styles.statValue}>{formatCurrency(dashboardData.totalSales)}</Text>
            </View>
          </View>
          <View style={[styles.statCard, styles.ordersCard]}>
            <View style={styles.statIconContainer}>
              <MaterialCommunityIcons name="shopping" size={24} color="#10B981" />
            </View>
            <View style={styles.statTextContainer}>
              <Text style={styles.statLabel}>Total Orders</Text>
              <Text style={styles.statValue}>{formatNumber(dashboardData.totalOrders)}</Text>
            </View>
          </View>
          <View style={[styles.statCard, styles.customerCard]}>
            <View style={styles.statIconContainer}>
              <MaterialCommunityIcons name="cellphone" size={24} color="#F59E0B" />
            </View>
            <View style={styles.statTextContainer}>
              <Text style={styles.statLabel}>Customer App Orders</Text>
              <Text style={styles.statValue}>{formatNumber(dashboardData.customerAppOrders)}</Text>
            </View>
          </View>
          <View style={[styles.statCard, styles.posCard]}>
            <View style={styles.statIconContainer}>
              <MaterialCommunityIcons name="desktop-classic" size={24} color="#8B5CF6" />
            </View>
            <View style={styles.statTextContainer}>
              <Text style={styles.statLabel}>POS App Orders</Text>
              <Text style={styles.statValue}>{formatNumber(dashboardData.posAppOrders)}</Text>
            </View>
          </View>
        </View>

        {/* Sales Chart */}
        {dashboardData.salesByDate.length > 0 && (
          <View style={styles.chartContainer}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Sales Trend</Text>
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: '#4F46E5' }]} />
                  <Text style={styles.legendText}>Revenue</Text>
                </View>
              </View>
            </View>
            <ScrollView horizontal={true} showsHorizontalScrollIndicator={true}>
              <LineChart
                data={{
                  labels: dashboardData.salesByDate.map(item => {
                    try {
                      // Parse the date string to create a valid Date object
                      const dateParts = item.date.split('/');
                      // Create date in MM/DD/YYYY format
                      const date = new Date(
                        parseInt(dateParts[2]), // year
                        parseInt(dateParts[0]) - 1, // month (0-indexed)
                        parseInt(dateParts[1]) // day
                      );
                      
                      // Check if the date is valid
                      if (isNaN(date.getTime())) {
                        console.error('Invalid date:', item.date);
                        return item.date; // Return original string if parsing fails
                      }
                      
                      // Format the date to show at the bottom of the chart
                      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    } catch (error) {
                      console.error('Error formatting date:', error, item.date);
                      return item.date; // Return original string if error occurs
                    }
                  }),
                  datasets: [{
                    data: dashboardData.salesByDate.map(item => item.amount),
                    color: (opacity = 1) => `rgba(79, 70, 229, ${opacity})`,
                    strokeWidth: 2
                  }]
                }}
                width={Math.max(Dimensions.get('window').width - 30, dashboardData.salesByDate.length * 100)}
                height={220}
                chartConfig={{
                  backgroundColor: '#FFFFFF',
                  backgroundGradientFrom: '#FFFFFF',
                  backgroundGradientTo: '#FFFFFF',
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(79, 70, 229, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(75, 85, 99, ${opacity})`,
                  propsForDots: {
                    r: '5',
                    strokeWidth: '2',
                    stroke: '#4F46E5'
                  },
                  propsForBackgroundLines: {
                    strokeDasharray: '5, 5',
                    stroke: '#E5E7EB'
                  },
                  style: {
                    borderRadius: 16
                  }
                }}
                bezier
                style={{
                  marginVertical: 8,
                  borderRadius: 16,
                  paddingRight: 70
                }}
              />
            </ScrollView>
          </View>
        )}

        {/* Top Selling Items */}
        <View style={styles.topItemsContainer}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="trophy" size={22} color="#F59E0B" />
            <Text style={styles.topItemsTitle}>Top Selling Items</Text>
          </View>
          {dashboardData.topSellingItems.map((item, index) => (
            <View key={item.name} style={styles.topItemRow}>
              <View style={styles.topItemInfo}>
                <View style={[styles.rankBadge, index === 0 ? styles.firstRank : (index === 1 ? styles.secondRank : (index === 2 ? styles.thirdRank : styles.otherRank))]}>
                  <Text style={styles.rankText}>#{index + 1}</Text>
                </View>
                <Text style={styles.topItemName}>{item.name}</Text>
              </View>
              <View style={styles.quantityBadge}>
                <Text style={[styles.topItemQuantity, Platform.OS === 'web' && styles.topItemQuantity]}>{item.quantity} sold</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Inventory Report Modal */}
      <Modal
        visible={showInventoryModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowInventoryModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="archive" size={24} color="#F36514" />
              <Text style={styles.modalTitle}>Inventory Summary</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowInventoryModal(false)}
              >
                <Ionicons name="close-circle" size={28} color="#F36514" />
              </TouchableOpacity>
            </View>

            {/* Modal Body - Scrollable Content */}
            <ScrollView 
              style={{flex: 1, width: '100%'}} 
              contentContainerStyle={{paddingBottom: 20}}
            >
              {/* Low Stock Items */}
              <View style={{marginBottom: 20}}>
                <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10}}>
                  <MaterialCommunityIcons name="alert-circle" size={20} color="#EF4444" />
                  <Text style={{fontSize: 18, fontWeight: 'bold', color: '#333', marginLeft: 8}}>
                    Low Stock Items ({dashboardData.lowStockItems.length})
                  </Text>
                </View>
                
                {dashboardData.lowStockItems.length > 0 ? (
                  dashboardData.lowStockItems.map(item => (
                    <View 
                      key={item.id} 
                      style={{
                        backgroundColor: '#F9FAFB',
                        borderRadius: 8,
                        padding: 12,
                        marginBottom: 8,
                        borderLeftWidth: 4,
                        borderLeftColor: '#EF4444'
                      }}
                    >
                      <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5}}>
                        <Text style={{fontSize: 16, fontWeight: '600', color: '#333', flex: 1}}>
                          {item.name}
                        </Text>
                        <Text style={{color: '#EF4444', fontWeight: '600'}}>
                          {item.quantity} left
                        </Text>
                      </View>
                      <Text style={{fontSize: 14, color: '#666'}}>
                        Below minimum threshold of {item.threshold}
                      </Text>
                    </View>
                  ))
                ) : (
                  <View style={{padding: 12, backgroundColor: '#F9FAFB', borderRadius: 8}}>
                    <Text style={{textAlign: 'center', color: '#666', fontStyle: 'italic'}}>
                      No low stock items
                    </Text>
                  </View>
                )}
              </View>

              {/* Expiring Items */}
              <View style={{marginBottom: 20}}>
                <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10}}>
                  <MaterialCommunityIcons name="clock-alert" size={20} color="#F59E0B" />
                  <Text style={{fontSize: 18, fontWeight: 'bold', color: '#333', marginLeft: 8}}>
                    Expiring Soon ({dashboardData.expiringItems.length})
                  </Text>
                </View>
                
                {dashboardData.expiringItems.length > 0 ? (
                  dashboardData.expiringItems.map(item => {
                    // Find all expiration dates within the next 7 days
                    let expiringBatches: Array<{date: Date, quantity: number}> = [];
                    
                    // Add direct expiration date if it exists and is expiring soon
                    if (item.expirationDate) {
                      const expiryDate = new Date(item.expirationDate);
                      const sevenDaysFromNow = new Date();
                      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
                      
                      if (expiryDate <= sevenDaysFromNow && expiryDate >= new Date()) {
                        expiringBatches.push({
                          date: expiryDate,
                          quantity: item.quantity
                        });
                      }
                    }
                    
                    // Check restock history for expiration dates
                    if (item.restockHistory && item.restockHistory.length > 0) {
                      item.restockHistory.forEach(history => {
                        if (history.expirationDate) {
                          const historyDate = new Date(history.expirationDate);
                          const sevenDaysFromNow = new Date();
                          sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
                          
                          // Only consider dates in the next 7 days
                          if (historyDate <= sevenDaysFromNow && historyDate >= new Date()) {
                            expiringBatches.push({
                              date: historyDate,
                              quantity: history.quantity - (history.damages || 0)
                            });
                          }
                        }
                      });
                    }
                    
                    // Sort batches by date (soonest first)
                    expiringBatches.sort((a, b) => a.date.getTime() - b.date.getTime());
                    
                    return (
                      <View 
                        key={item.id} 
                        style={{
                          backgroundColor: '#F9FAFB',
                          borderRadius: 8,
                          padding: 12,
                          marginBottom: 8,
                          borderLeftWidth: 4,
                          borderLeftColor: '#F59E0B'
                        }}
                      >
                        <View style={{marginBottom: 5}}>
                          <Text style={{fontSize: 16, fontWeight: '600', color: '#333'}}>
                            {item.name}
                          </Text>
                        </View>
                        
                        {expiringBatches.length > 0 ? (
                          <View>
                            {expiringBatches.map((batch, index) => (
                              <View 
                                key={index} 
                                style={{
                                  flexDirection: 'row',
                                  justifyContent: 'space-between',
                                  paddingVertical: 4,
                                  borderBottomWidth: index < expiringBatches.length - 1 ? 1 : 0,
                                  borderBottomColor: '#E5E7EB'
                                }}
                              >
                                <Text style={{fontSize: 14, color: '#555'}}>
                                  Expires: {batch.date.toLocaleDateString()}
                                </Text>
                                <Text style={{color: '#F59E0B', fontWeight: '600'}}>
                                  {batch.quantity} in stock
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text style={{fontSize: 14, color: '#666', fontStyle: 'italic'}}>
                            No specific expiration data available
                          </Text>
                        )}
                      </View>
                    );
                  })
                ) : (
                  <View style={{padding: 12, backgroundColor: '#F9FAFB', borderRadius: 8}}>
                    <Text style={{textAlign: 'center', color: '#666', fontStyle: 'italic'}}>
                      No items expiring soon
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  inventoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F36514',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  inventoryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inventoryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  datePickerContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    position: 'relative',
  },
  dateRangeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 2,
  },
  dateRangeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  dateButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    flex: 0.48,
    borderWidth: 0,
    borderColor: '#E5E7EB',
  },
  dateText: {
    marginLeft: 8,
    color: '#4B5563',
    fontSize: 14,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F36514',
    padding: 14,
    borderRadius: 8,
    shadowColor: '#F36514',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmButtonText: {
    marginLeft: 8,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    width: '23%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 2,
    marginBottom: 16,
  },
  salesCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#4F46E5',
  },
  ordersCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  customerCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  posCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#8B5CF6',
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(243, 244, 246, 0.7)',
  },
  statTextContainer: {
    flex: 1,
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  chartContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 2,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  chartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#6B7280',
  },
  topItemsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  topItemsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  topItemInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  firstRank: {
    backgroundColor: '#FEF3C7',
  },
  secondRank: {
    backgroundColor: '#E5E7EB',
  },
  thirdRank: {
    backgroundColor: '#FECACA',
  },
  otherRank: {
    backgroundColor: '#F3F4F6',
    },
    topItemQuantity: {
      fontSize: Platform.select({
        default: 14,
        web: Dimensions.get('window').width > 768 ? 15 : 14
      }),
      fontWeight: '600',
      color: '#4B5563'
    },
    // Add new tablet-responsive styles
    topItemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Platform.select({
        default: 12,
        web: Dimensions.get('window').width > 768 ? 14 : 12
      }),
      marginHorizontal: Platform.select({
        default: 8,
        web: Dimensions.get('window').width > 768 ? 16 : 8
      })
    },
    rankBadge: {
      width: Platform.select({
        default: 32,
        web: Dimensions.get('window').width > 768 ? 40 : 32
      }),
      height: Platform.select({
        default: 32,
        web: Dimensions.get('window').width > 768 ? 40 : 32
      }),
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12
    },
    topItemName: {
      fontSize: Platform.select({
        default: 16,
        web: Dimensions.get('window').width > 768 ? 18 : 16
      }),
      fontWeight: '500',
      color: '#1F2937'
    },
  quantityBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    paddingRight: 12,
    borderRadius: 16,
    ...(Platform.OS === 'web' && Dimensions.get('window').width >= 768 && {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      marginRight: 20,
    }),
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    gap: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '500',
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
    shadowColor: '#9CA3AF',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 15,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: Platform.OS === 'web' ? '70%' : '90%',
    height: Platform.OS === 'web' ? '75%' : '80%',
    maxWidth: 700,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    flex: 1,
    marginLeft: 10,
  },
  closeButton: {
    padding: 4,
  },
  webDateInputContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
    gap: 10,
  },
  dateInputGroup: {
    flex: 1,
  },
  dateInputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
    marginBottom: 5,
  },
  dateInput: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 14,
    color: '#1F2937',
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F36514',
    padding: 14,
    borderRadius: 8,
    minWidth: 110,
    shadowColor: '#F36514',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  rankText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginVertical: 4
  },
});