import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator, Modal, Switch, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { uploadImage } from '../utils/cloudinary';
import { db } from '../firebaseConfig';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, onSnapshot } from 'firebase/firestore';
import { Alert } from 'react-native';
import { router } from 'expo-router';
// Replace the problematic import with a direct color definition
// import { Colors } from 'react-native/Libraries/NewAppScreen';

interface Category {
  id: string;
  name: string;
}

interface SizeData {
  price: string;
}

interface Product {
  id: string;
  categoryId: string;
  name: string;
  basePrice: string;
  imageUrl: string;
  description: string;
  status: 'available' | 'unavailable';
  hasSizes?: boolean;
  sizes?: {
    [key: string]: SizeData;
  };
  isAvailable: boolean;
}

interface ConfirmationModalData {
  type: 'category' | 'product';
  id: string;
  name?: string; // Optional: for displaying the item name in the modal
}

export default function AddItems() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    isAvailable: true
  });
  const [sizesData, setSizesData] = useState<{ [key: string]: SizeData }>({});
  const [editMode, setEditMode] = useState<{ type: 'category' | 'product'; id: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [newSizeName, setNewSizeName] = useState('');
  const [showAddSize, setShowAddSize] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<ConfirmationModalData | null>(null);

  useEffect(() => {
    // Subscribe to categories
    const unsubscribeCategories = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const categoriesData = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
      }));
      setCategories(categoriesData);
    });

    // Subscribe to products
    const unsubscribeProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Product[];
      setProducts(productsData);
    });

    return () => {
      unsubscribeCategories();
      unsubscribeProducts();
    };
  }, []);

  const handleAddOrUpdateProduct = async () => {
    setSubmitAttempted(true);
    setErrorMessage('');
    
    if (!selectedCategory) {
      setErrorMessage('Please select a category');
      return;
    }
    
    if (!newProduct.name?.trim()) {
      setErrorMessage('Product name is required');
      return;
    }
    
    // Validate depending on whether we have sizes or not
    if (!newProduct.hasSizes) {
      if (!newProduct.basePrice?.trim()) {
        setErrorMessage('Price is required when sizes are not used');
        return;
      }
      if (isNaN(Number(newProduct.basePrice)) || Number(newProduct.basePrice) <= 0) {
        setErrorMessage('Price must be a valid positive number');
        return;
      }
    } else if (newProduct.hasSizes) {
      // Check if there are sizes defined
      if (!newProduct.sizes || Object.keys(newProduct.sizes).length === 0) {
        setErrorMessage('Please add at least one size when using sizes');
        return;
      }
      
      // Check if all sizes have valid prices
      let hasInvalidPrice = false;
      Object.entries(newProduct.sizes).forEach(([sizeName, sizeData]) => {
        if (!sizeData.price.trim()) {
          setErrorMessage(`Price for ${sizeName} is required`);
          hasInvalidPrice = true;
        } else if (isNaN(Number(sizeData.price)) || Number(sizeData.price) <= 0) {
          setErrorMessage(`Price for ${sizeName} must be a valid positive number`);
          hasInvalidPrice = true;
        }
      });
      
      if (hasInvalidPrice) return;
    }

    try {
      setIsLoading(true);

      // Prepare the product data
      const productData = {
        name: newProduct.name.trim(),
        basePrice: newProduct.hasSizes ? '' : (newProduct.basePrice?.trim() || ''),
        categoryId: selectedCategory.id,
        description: newProduct.description?.trim() || '',
        imageUrl: newProduct.imageUrl || '',
        status: 'available',
        hasSizes: newProduct.hasSizes || false,
        sizes: newProduct.hasSizes && newProduct.sizes ? newProduct.sizes : null,
        isAvailable: newProduct.isAvailable ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (editMode?.type === 'product' && editMode.id) {
        await updateDoc(doc(db, 'products', editMode.id), {
          ...productData,
          updatedAt: new Date().toISOString(),
        });
        setShowProductModal(false);
        setNewProduct({ isAvailable: true });
        setSizesData({});
        setEditMode(null);
        setSubmitAttempted(false);
        setErrorMessage('');
        
        Alert.alert('Success', 'Product updated successfully!');
      } else {
        await addDoc(collection(db, 'products'), productData);
        setShowProductModal(false);
        setNewProduct({ isAvailable: true });
        setSizesData({});
        setEditMode(null);
        setSubmitAttempted(false);
        setErrorMessage('');

        Alert.alert('Success', 'Product added successfully!');
      }
    } catch (error) {
      console.error('Error saving product:', error);
      setErrorMessage('Failed to save product');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCategory = async () => {
    if (newCategoryName.trim()) {
      try {
        setIsLoading(true);
        const docRef = await addDoc(collection(db, 'categories'), {
          name: newCategoryName.trim(),
        });
        
        // Close the modal and reset state immediately after success
        setNewCategoryName('');
        setShowCategoryModal(false);
        setIsLoading(false);
        
        // Show success message after modal is closed
        Alert.alert('Success', 'Category added successfully!');
      } catch (error) {
        console.error('Error adding category:', error);
        Alert.alert('Error', 'Failed to add category');
        setIsLoading(false);
      }
    }
  };

  const executeDeleteCategory = async (categoryId: string) => {
    try {
      setIsLoading(true);
      // Delete the category
      await deleteDoc(doc(db, 'categories', categoryId));
      
      // Delete all products in this category
      const productsQuery = query(collection(db, 'products'), where('categoryId', '==', categoryId));
      const productsSnapshot = await getDocs(productsQuery);
      const deletePromises = productsSnapshot.docs.map(productDoc => deleteDoc(productDoc.ref));
      await Promise.all(deletePromises);
      
      if (selectedCategory?.id === categoryId) {
        setSelectedCategory(null); // Deselect if the current category is deleted
      }
      Alert.alert('Success', 'Category and its products deleted successfully.'); // Simple alert for success is fine
    } catch (error) {
      console.error('Error deleting category:', error);
      Alert.alert('Error', 'Failed to delete category.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCategory = (category: Category) => {
    setItemToDelete({ type: 'category', id: category.id, name: category.name });
    setShowConfirmationModal(true);
  };

  const handleEditCategory = (category: Category) => {
    setEditMode({ type: 'category', id: category.id });
    setNewCategoryName(category.name);
  };

  const handleUpdateCategory = async (categoryId: string) => {
    try {
      setIsLoading(true);
      await updateDoc(doc(db, 'categories', categoryId), {
        name: newCategoryName,
      });
      Alert.alert('Success', 'Category updated successfully!', [
        { 
          text: 'OK',
          onPress: () => {
            setEditMode(null);
            setNewCategoryName('');
            setIsLoading(false);
            setShowCategoryModal(false);
          }
        }
      ]);
    } catch (error) {
      console.error('Error updating category:', error);
      Alert.alert('Error', 'Failed to update category');
    } finally {
      setIsLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library to upload images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setIsUploadingImage(true);
        setErrorMessage('');
        
        try {
          const uploadResponse = await uploadImage(result.assets[0].uri);
          
          if (uploadResponse && uploadResponse.secure_url) {
            setNewProduct(prev => ({ ...prev, imageUrl: uploadResponse.secure_url }));
            console.log('Image uploaded successfully:', uploadResponse.secure_url);
          } else {
            setErrorMessage('Failed to upload image. Please try again.');
            Alert.alert('Upload Failed', 'Failed to upload image. Please try again.');
          }
        } catch (error) {
          console.error('Error uploading image:', error);
          setErrorMessage('Failed to upload image. Please try again.');
          Alert.alert('Upload Error', 'An error occurred while uploading the image. Please try again.');
        } finally {
          setIsUploadingImage(false);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      setErrorMessage('Failed to pick image. Please try again.');
      Alert.alert('Error', 'Failed to access photo library. Please try again.');
    }
  };

  const validateProduct = () => {
    if (!selectedCategory) {
      setErrorMessage('Please select a category');
      return false;
    }
    if (!newProduct.name?.trim()) {
      setErrorMessage('Product name is required');
      return false;
    }
    if (!newProduct.hasSizes) {
      if (!newProduct.basePrice?.trim()) {
        setErrorMessage('Price is required when cup sizes are not used');
        return false;
      }
      if (isNaN(Number(newProduct.basePrice)) || Number(newProduct.basePrice) <= 0) {
        setErrorMessage('Price must be a valid positive number');
        return false;
      }
    } else if (newProduct.sizes) {
      // Validate cup size prices if they are provided
      for (const [sizeName, sizeData] of Object.entries(newProduct.sizes)) {
        if (sizeData.price && (isNaN(Number(sizeData.price)) || Number(sizeData.price) <= 0)) {
          setErrorMessage(`Price for ${sizeName} must be a valid positive number`);
          return false;
        }
      }
    }
    return true;
  };

  const handleAddProduct = async () => {
    setSubmitAttempted(true);
    setErrorMessage('');
    if (!validateProduct()) return;

    try {
      setIsLoading(true);
      
      // Prepare the sizes data if hasSizes is true
      const sizesData: { [key: string]: { price: string } } = {};
      if (newProduct.hasSizes && newProduct.sizes) {
        Object.entries(newProduct.sizes).forEach(([key, value]) => {
          if (value.price) {
            sizesData[key] = {
              price: value.price?.trim() || ''
            };
          }
        });
      }

      // Prepare the product data
      const productData = {
        categoryId: selectedCategory!.id,
        name: newProduct.name!.trim(),
        basePrice: newProduct.hasSizes ? '' : (newProduct.basePrice?.trim() || ''),
        imageUrl: newProduct.imageUrl || '',
        description: newProduct.description?.trim() || '',
        status: 'available',
        hasSizes: newProduct.hasSizes || false,
        sizes: Object.keys(sizesData).length > 0 ? sizesData : null,
        isAvailable: newProduct.isAvailable,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      console.log('Adding product with data:', productData);

      await addDoc(collection(db, 'products'), productData);
      
      Alert.alert('Success', 'Product added successfully!', [
        { 
          text: 'OK',
          onPress: () => {
            setNewProduct({
              isAvailable: true
            });
            setIsLoading(false);
            setShowProductModal(false);
          }
        }
      ]);
    } catch (error) {
      console.error('Error adding product:', error);
      if (error instanceof Error) {
        setErrorMessage(`Failed to add product: ${error.message}`);
      } else {
        setErrorMessage('Failed to add product. Please try again.');
      }
      Alert.alert('Error', 'Failed to add product');
    } finally {
      setIsLoading(false);
    }
  };

  const executeDeleteProduct = async (productId: string) => {
    try {
      setIsLoading(true);
      await deleteDoc(doc(db, 'products', productId));
      Alert.alert('Success', 'Product deleted successfully.'); // Simple alert for success is fine
    } catch (error) {
      console.error('Error deleting product:', error);
      Alert.alert('Error', 'Failed to delete product.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProduct = (product: Product) => {
    setItemToDelete({ type: 'product', id: product.id, name: product.name });
    setShowConfirmationModal(true);
  };

  const handleEditProduct = (product: Product) => {
    setEditMode({ type: 'product', id: product.id });
    setNewProduct({
      name: product.name,
      basePrice: product.basePrice,
      description: product.description,
      imageUrl: product.imageUrl,
      hasSizes: product.hasSizes,
      sizes: product.sizes,
      isAvailable: product.isAvailable
    });
    setShowProductModal(true);
  };

  const handleUpdateProduct = async (id: string) => {
    setSubmitAttempted(true);
    setErrorMessage('');
    if (!validateProduct()) return;

    try {
      setIsLoading(true);
      const productRef = doc(db, 'products', id);

      // Prepare the sizes data if hasSizes is true
      const sizesData: { [key: string]: { price: string } } = {};
      if (newProduct.hasSizes && newProduct.sizes) {
        Object.entries(newProduct.sizes).forEach(([key, value]) => {
          if (value.price) {
            sizesData[key] = {
              price: value.price?.trim() || ''
            };
          }
        });
      }

      // Create a clean update object with only defined values
      const updateData: Partial<{
        name: string;
        basePrice: string;
        description: string;
        imageUrl: string;
        hasSizes: boolean;
        sizes: { [key: string]: { price: string } } | null;
        isAvailable: boolean;
        updatedAt: string;
      }> = {
        name: newProduct.name?.trim(),
        basePrice: newProduct.hasSizes ? '' : (newProduct.basePrice?.trim() || ''),
        description: newProduct.description?.trim() || '',
        imageUrl: newProduct.imageUrl || '',
        hasSizes: newProduct.hasSizes || false,
        sizes: Object.keys(sizesData).length > 0 ? sizesData : null,
        isAvailable: newProduct.isAvailable ?? true,
        updatedAt: new Date().toISOString()
      };

      // Remove any undefined values
      const cleanedData = Object.fromEntries(
        Object.entries(updateData).filter(([_, value]) => value !== undefined)
      );

      console.log('Updating product with data:', cleanedData);

      await updateDoc(productRef, cleanedData);
      
      // Call the helper function to close modal and reset state
      closeProductModal(); 

      Alert.alert('Success', 'Product updated successfully!');

    } catch (error) {
      console.error('Error updating product:', error);
      if (error instanceof Error) {
        setErrorMessage(`Failed to update product: ${error.message}`);
      } else {
        setErrorMessage('Failed to update product. Please try again.');
      }
      // Don't close the modal on error, so user can fix input
      // Alert.alert('Error', 'Failed to update product'); // Error message is shown in modal now
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSize = () => {
    if (!newSizeName.trim()) {
      setErrorMessage('Please enter a size name');
      return;
    }

    setNewProduct(prev => {
      const updatedSizes = { ...(prev.sizes || {}) };
      if (updatedSizes[newSizeName]) {
        setErrorMessage('Size name already exists');
        return prev;
      }

      updatedSizes[newSizeName] = { price: '' };
      return {
        ...prev,
        sizes: updatedSizes
      };
    });

    setNewSizeName('');
    setErrorMessage('');
  };

  const handleSizeChange = (sizeName: string, field: 'price', value: string) => {
    setNewProduct(prev => {
      const updatedSizes = { ...(prev.sizes || {}) };
      if (!updatedSizes[sizeName]) {
        updatedSizes[sizeName] = { price: '' };
      }
      updatedSizes[sizeName] = {
        ...updatedSizes[sizeName],
        [field]: value
      };
      
      return {
        ...prev,
        sizes: updatedSizes
      };
    });
  };

  const handleDeleteSize = (sizeName: string) => {
    setNewProduct(prev => {
      const updatedSizes = { ...(prev.sizes || {}) };
      delete updatedSizes[sizeName];
      return {
        ...prev,
        sizes: updatedSizes
      };
    });
  };

  // --- Confirmation Modal Handler ---
  const handleConfirmDelete = () => {
    if (!itemToDelete) return;

    if (itemToDelete.type === 'category') {
      executeDeleteCategory(itemToDelete.id);
    } else if (itemToDelete.type === 'product') {
      executeDeleteProduct(itemToDelete.id);
    }

    setShowConfirmationModal(false);
    setItemToDelete(null);
  };

  const handleCancelDelete = () => {
    setShowConfirmationModal(false);
    setItemToDelete(null);
  };
  // --- End Confirmation Modal Handler ---

  const closeProductModal = () => {
    setShowProductModal(false);
    setNewProduct({ isAvailable: true });
    setEditMode(null);
    setErrorMessage('');
    setSubmitAttempted(false);
    setNewSizeName('');
  };

  const handleSubmitProduct = () => {
    if (editMode?.type === 'product') {
      handleUpdateProduct(editMode.id);
    } else {
      handleAddOrUpdateProduct();
    }
  };

  const closeCategoryModal = () => {
    setShowCategoryModal(false);
    setNewCategoryName('');
    setEditMode(null);
  };

  const handleSubmitCategory = () => {
    if (editMode?.type === 'category') {
      handleUpdateCategory(editMode.id);
    } else {
      handleAddCategory();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <FontAwesome name="arrow-left" size={20} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.title}>Manage Items</Text>
      </View>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      )}
      <View style={styles.splitContainer}>
        {/* Left Side - Categories */}
        <View style={styles.leftPanel}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Categories</Text>
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => setShowCategoryModal(true)}
            >
              <Text style={styles.addButtonText}>Add Category</Text>
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.categoryList}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* Categories List */}
            {categories.map(category => (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.categoryItem,
                  selectedCategory?.id === category.id && styles.selectedCategoryItem
                ]}
                onPress={() => setSelectedCategory(category)}
              >
                <Text style={[
                  styles.categoryItemText,
                  selectedCategory?.id === category.id && styles.selectedCategoryItemText
                ]}>
                  {category.name}
                </Text>
                <View style={styles.actions}>
                  <TouchableOpacity onPress={() => {
                    setEditMode({ type: 'category', id: category.id });
                    setNewCategoryName(category.name);
                    setShowCategoryModal(true);
                  }}>
                    <MaterialIcons name="edit" size={24} color="#4B5563" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteCategory(category)}>
                    <MaterialIcons name="delete" size={24} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Right Side - Products */}
        <View style={styles.rightPanel}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {selectedCategory ? `Products - ${selectedCategory.name}` : 'Select a category'}
            </Text>
            <TouchableOpacity 
              style={[
                styles.addButton,
                !selectedCategory && styles.disabledButton
              ]}
              onPress={() => {
                if (!selectedCategory) {
                  Alert.alert('Error', 'Please select a category first');
                  return;
                }
                setShowProductModal(true);
              }}
              disabled={!selectedCategory}
            >
              <Text style={styles.addButtonText}>Add Product</Text>
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.productContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* Products List */}
            <View style={styles.productList}>
              {products
                .filter(product => product.categoryId === selectedCategory?.id)
                .map(product => (
                  <View key={product.id} style={styles.productCard}>
                    {product.imageUrl ? (
                      <Image
                        source={{ uri: product.imageUrl }}
                        style={styles.productImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.productImage, { backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={{ color: '#6B7280' }}>No Image</Text>
                      </View>
                    )}
                    <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                    {!product.hasSizes ? (
                      <Text style={styles.productPrice}>₱{product.basePrice}</Text>
                    ) : (
                      <View>
                        {Object.entries(product.sizes || {}).map(([size, data]) => (
                          <Text key={size} style={styles.productPrice}>
                            {size}: ₱{data.price}
                          </Text>
                        ))}
                      </View>
                    )}
                    <View style={styles.productActions}>
                      <View style={styles.buttonContainer}>
                        <TouchableOpacity
                          style={[styles.actionButton, styles.editButton]}
                          onPress={() => handleEditProduct(product)}
                        >
                          <FontAwesome name="edit" size={16} color="#FFFFFF" />
                          <Text style={styles.actionButtonText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionButton, styles.deleteButton]}
                          onPress={() => handleDeleteProduct(product)}
                        >
                          <FontAwesome name="trash" size={16} color="#FFFFFF" />
                          <Text style={styles.actionButtonText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.availabilityContainer}>
                        <Text style={styles.availabilityText}>Available</Text>
                        <Switch
                          value={product.status === 'available'}
                          onValueChange={(value) => handleToggleAvailability(product.id, value)}
                          trackColor={{ false: "#9CA3AF", true: "#3B82F6" }}
                          thumbColor="#FFFFFF"
                        />
                      </View>
                    </View>
                  </View>
                ))}
            </View>
          </ScrollView>
        </View>
      </View>

      {/* Category Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showCategoryModal}
        onRequestClose={closeCategoryModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.categoryModalContent]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editMode?.type === 'category' ? 'Edit Category' : 'Add New Category'}
              </Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={closeCategoryModal}
              >
                <MaterialIcons name="close" size={28} color="#4B5563" />
              </TouchableOpacity>
            </View>

            <View style={styles.categoryModalBody}>
              <TextInput
                style={styles.modalInput}
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                placeholder="Enter Category Name"
                placeholderTextColor="#9CA3AF"
                autoFocus={true}
              />
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={closeCategoryModal}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.submitButton]}
                onPress={handleSubmitCategory}
                disabled={!newCategoryName.trim() || isLoading}
              >
                {isLoading && editMode?.type !== 'category' ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>
                    {editMode?.type === 'category' ? 'Update' : 'Add Category'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Product Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showProductModal}
        onRequestClose={closeProductModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.productModalContent]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editMode?.type === 'product' ? 'Edit Product' : 'Add Product'}
              </Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={closeProductModal}
              >
                <MaterialIcons name="close" size={28} color="#4B5563" />
              </TouchableOpacity>
              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
            </View>
            
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
              <View style={styles.modalBody}>
                <View style={[styles.formSection, styles.basicInfoSection]}>
                  <TextInput
                    style={styles.modalInput}
                    value={newProduct.name}
                    onChangeText={(text) => setNewProduct({ ...newProduct, name: text })}
                    placeholder="Product Name"
                    placeholderTextColor="#9CA3AF"
                  />
                  <TextInput
                    style={[
                      styles.modalInput,
                      newProduct.hasSizes && styles.disabledInput
                    ]}
                    value={newProduct.basePrice}
                    onChangeText={(text) => {
                      if (text === '' || /^\d*\.?\d*$/.test(text)) {
                        setNewProduct({ ...newProduct, basePrice: text });
                      }
                    }}
                    placeholder="Base Price (if no sizes)"
                    keyboardType="numeric"
                    placeholderTextColor="#9CA3AF"
                    editable={!newProduct.hasSizes}
                  />
                  <TextInput
                    style={[styles.modalInput, styles.textArea]}
                    value={newProduct.description}
                    onChangeText={(text) => setNewProduct({ ...newProduct, description: text })}
                    placeholder="Description (Optional)"
                    multiline
                    numberOfLines={3}
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={[
                  styles.middleSectionContainer, 
                  { flexDirection: Platform.OS === 'web' ? 'row' : 'column' }
                ]}>
                  <View style={[
                    styles.formSection, 
                    styles.sizesSection,
                    Platform.OS !== 'web' && { marginBottom: 20 }
                  ]}>
                    <Text style={styles.formSectionTitle}>Sizes</Text>
                    <View style={styles.checkboxContainer}>
                      <TouchableOpacity
                        style={[styles.checkbox, newProduct.hasSizes && styles.checkboxChecked]}
                        onPress={() => setNewProduct(prev => ({
                          ...prev,
                          hasSizes: !prev.hasSizes,
                          sizes: !prev.hasSizes ? {} : undefined,
                          basePrice: !prev.hasSizes ? '' : prev.basePrice
                        }))}
                        activeOpacity={0.7}
                      >
                        {newProduct.hasSizes && (
                          <Text style={styles.checkmark}>✓</Text>
                        )}
                      </TouchableOpacity>
                      <Text style={styles.checkboxLabel}>Use Sizes?</Text>
                    </View>

                    {newProduct.hasSizes && (
                      <View style={styles.sizesInputArea}>
                        <View style={styles.addSizeContainer}>
                          <TextInput
                            style={[styles.modalInput, { marginBottom: 0, flex: 1 }]}
                            placeholder="Size Name"
                            value={newSizeName}
                            onChangeText={setNewSizeName}
                            placeholderTextColor="#9CA3AF"
                          />
                          <TouchableOpacity
                            style={styles.addSizeButton}
                            onPress={handleAddSize}
                          >
                            <MaterialIcons name="add" size={22} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>
                        
                        <ScrollView style={styles.sizeListScrollView} nestedScrollEnabled={true}>
                          {Object.keys(newProduct.sizes || {}).length > 0 ? (
                            Object.entries(newProduct.sizes || {}).map(([sizeName, sizeData]) => (
                              <View key={sizeName} style={styles.sizeRow}>
                                <Text style={styles.sizeLabel} numberOfLines={1}>{sizeName}</Text>
                                <TextInput
                                  style={[styles.modalInput, styles.priceInput]}
                                  placeholder="Price"
                                  value={sizeData.price}
                                  onChangeText={(text) => {
                                    if (text === '' || /^\d*\.?\d*$/.test(text)) {
                                      handleSizeChange(sizeName, 'price', text);
                                    }
                                  }}
                                  keyboardType="numeric"
                                  placeholderTextColor="#9CA3AF"
                                />
                                <TouchableOpacity
                                  style={styles.deleteSizeButton}
                                  onPress={() => handleDeleteSize(sizeName)}
                                >
                                  <MaterialIcons name="delete" size={20} color="#FFFFFF" />
                                </TouchableOpacity>
                              </View>
                            ))
                          ) : (
                            <Text style={styles.noSizesText}>Add sizes using the fields above.</Text>
                          )}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                  
                  <View style={[styles.formSection, styles.imageSection]}>
                    <Text style={styles.formSectionTitle}>Image</Text>
                    <TouchableOpacity
                      style={styles.imageUploadButton}
                      onPress={pickImage}
                      disabled={isUploadingImage}
                    >
                      <FontAwesome name="upload" size={18} color="#FFFFFF" />
                      <Text style={styles.buttonTextSmall}>
                        {isUploadingImage ? 'Uploading...' : (newProduct.imageUrl ? 'Change Image' : 'Upload Image')}
                      </Text>
                    </TouchableOpacity>

                    {newProduct.imageUrl ? (
                      <View style={styles.imagePreviewContainer}>
                        <Image
                          source={{ uri: newProduct.imageUrl }}
                          style={styles.previewImage}
                          resizeMode="contain"
                        />
                      </View>
                    ) : (
                      <View style={styles.noImageContainer}>
                        <FontAwesome name="image" size={30} color="#9CA3AF" />
                        <Text style={styles.noImageText}>No Image</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Modal Footer Buttons */}
            <View style={styles.modalFooter}> 
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={closeProductModal}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.submitButton]}
                onPress={handleSubmitProduct}
              >
                {isLoading ? (
                   <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>
                    {editMode?.type === 'product' ? 'Update Product' : 'Add Product'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showConfirmationModal}
        onRequestClose={handleCancelDelete}
      >
        <View style={styles.confirmationModalOverlay}>
          <View style={styles.confirmationModalContent}>
            <MaterialIcons name="warning" size={48} color="#F59E0B" style={{ alignSelf: 'center', marginBottom: 16 }} />
            <Text style={styles.confirmationModalTitle}>Confirm Deletion</Text>
            <Text style={styles.confirmationModalText}>
              Are you sure you want to delete '{itemToDelete?.name || 'this item'}'? 
              {itemToDelete?.type === 'category' && ' This will also delete all products in this category.'}
              This action cannot be undone.
            </Text>
            <View style={styles.confirmationModalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { backgroundColor: '#6B7280' }]}
                onPress={handleCancelDelete}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.deleteButton, { backgroundColor: '#EF4444' }]}
                onPress={handleConfirmDelete}
              >
                <Text style={styles.buttonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const handleToggleAvailability = async (productId: string, isAvailable: boolean) => {
  try {
    await updateDoc(doc(db, 'products', productId), {
      status: isAvailable ? 'available' : 'unavailable'
    });
  } catch (error) {
    console.error('Error updating product availability:', error);
    Alert.alert('Error', 'Failed to update product availability');
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  splitContainer: {
    flex: 1,
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  leftPanel: {
    width: '35%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  rightPanel: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  addButton: {
    backgroundColor: '#F36514',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '500',
    fontSize: 14,
  },
  categoryList: {
    flex: 1,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    marginBottom: 6,
  },
  selectedCategoryItem: {
    backgroundColor: '#EBF5FF',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  categoryItemText: {
    fontSize: 14,
    color: '#4B5563',
    flex: 1,
  },
  selectedCategoryItemText: {
    color: '#1E40AF',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 15,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '100%',
    maxWidth: 700,
    maxHeight: Platform.OS === 'web' ? '95%' : '85%',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  productModalContent: {
    height: Platform.OS === 'web' ? 'auto' : '85%', // Ensure visible height on tablet
  },
  modalHeader: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4B5563',
    flex: 1,
    textAlign: 'center',
    marginLeft: 30,
    marginRight: 30,
  },
  closeButton: {
    position: 'absolute',
    right: 10,
    top: 8,
    padding: 8,
    zIndex: 1,
  },
  errorText: {
    color: '#FFFFFF',
    backgroundColor: '#DC2626',
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    fontWeight: '500',
    position: 'absolute',
    bottom: -35,
    left: 15,
    right: 15,
    zIndex: 10,
    fontSize: 13,
  },
  modalBody: {
    flex: 1,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
  },
  formSection: {
    marginBottom: 15,
  },
  basicInfoSection: {
  },
  middleSectionContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 20,
    marginBottom: 15,
  },
  sizesSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  imageSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: Platform.OS === 'web' ? 'auto' : 250,
  },
  formSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 10,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalInput: {
    width: '100%',
    height: 45,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 12,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    fontSize: 14,
    color: '#1F2937',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 10,
    marginBottom: 0,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 8,
    width: '100%',
    maxWidth: 200,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#F36514',
    borderRadius: 4,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#F36514',
    borderColor: '#F36514',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '500',
  },
  sizesInputArea: {
    flex: 1,
    marginTop: 5,
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    display: 'flex',
    flexDirection: 'column',
  },
  addSizeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
  },
  addSizeButton: {
    backgroundColor: '#2563EB',
    width: 45,
    minWidth: 45,
    height: 45,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: 8,
  },
  sizeListScrollView: {
    flex: 1,
    maxHeight: 150,
  },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  sizeLabel: {
    flexShrink: 1,
    fontSize: 14,
    color: '#374151',
    marginRight: 5,
    fontWeight: '500',
  },
  priceInput: {
    flex: 1,
    marginBottom: 0,
    height: 40,
    fontSize: 13,
  },
  deleteSizeButton: {
    backgroundColor: '#EF4444',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noSizesText: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 10,
    padding: 10,
  },
  imageUploadButton: {
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  buttonTextSmall: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  imagePreviewContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: Platform.OS === 'web' ? 100 : 150,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  noImageContainer: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    minHeight: Platform.OS === 'web' ? 100 : 150,
  },
  noImageText: {
    color: '#6B7280',
    marginTop: 8,
    fontSize: 13,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    padding: 15, 
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB', 
    backgroundColor: '#F9FAFB', 
  },
  modalButton: {
    flex: 1,
    height: 45, 
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.18,
    shadowRadius: 1.00,
    elevation: 1,
  },
  submitButton: {
    backgroundColor: '#F36514',
  },
  cancelButton: {
    backgroundColor: '#6B7280',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  productContent: {
    flex: 1,
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
  },
  productList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 12,
  },
  productCard: {
    width: '31%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  productImage: {
    width: '100%',
    height: 100,
    borderRadius: 6,
    marginBottom: 8,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '500',
  },
  productActions: {
    flexDirection: 'column',
    gap: 8,
    paddingTop: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    flex: 1,
    gap: 4,
  },
  editButton: {
    backgroundColor: '#3B82F6',
  },
  deleteButton: {
    backgroundColor: '#EF4444',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  availabilityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F6',
    padding: 8,
    borderRadius: 6,
  },
  availabilityText: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '500',
  },
  confirmationModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmationModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  confirmationModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 12,
  },
  confirmationModalText: {
    fontSize: 16,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  confirmationModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  disabledInput: {
    backgroundColor: '#E5E7EB',
    color: '#9CA3AF',
  },
  categoryModalContent: {
    maxWidth: 450,
  },
  categoryModalBody: {
    padding: 24,
  },
});
