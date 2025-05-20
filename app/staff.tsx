import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Modal,
  Platform,
  Dimensions,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  setDoc,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { router } from 'expo-router';
import { useUser } from './contexts/UserContext';

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
  lastLogin?: string;
}

export default function StaffScreen() {
  const { role } = useUser();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);

  const auth = getAuth();
  const db = getFirestore();

  // Redirect if not owner
  useEffect(() => {
    if (role !== 'owner') {
      router.replace('/');
    }
  }, [role]);

  useEffect(() => {
    // Subscribe to employee updates
    const employeesRef = collection(db, 'users');
    const q = query(employeesRef, where('role', '==', 'employee'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const employeeList: Employee[] = [];
      snapshot.forEach((doc) => {
        employeeList.push({ id: doc.id, ...doc.data() } as Employee);
      });
      setEmployees(employeeList);
    });

    return () => unsubscribe();
  }, []);

  const addEmployee = async () => {
    // Clear any previous errors
    setModalError(null);
    
    if (!name || !email || !password) {
      setModalError('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      // Create authentication account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Add user details to Firestore using the auth UID as the document ID
      const userData = {
        uid: user.uid,
        name,
        email,
        role: 'employee',
        status: 'active',
        createdAt: new Date().toISOString(),
        lastLogin: null,
      };

      // Use setDoc instead of addDoc to specify the document ID
      await setDoc(doc(db, 'users', user.uid), userData);

      setModalVisible(false);
      setName('');
      setEmail('');
      setPassword('');
      setModalError(null);
      Alert.alert('Success', 'Employee added successfully');
    } catch (error: any) {
      // Delete the auth user if Firestore update fails
      try {
        if (auth.currentUser && error.message !== 'auth/email-already-in-use') {
          await auth.currentUser.delete();
        }
      } catch (deleteError) {
        console.error('Error cleaning up auth user:', deleteError);
      }

      let errorMessage = 'Unable to add employee';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'An account with this email already exists';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password should be at least 6 characters';
      }
      setModalError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const deleteEmployee = (employee: Employee) => {
    setEmployeeToDelete(employee);
    setShowDeleteModal(true);
  };

  const confirmDeleteEmployee = async () => {
    if (!employeeToDelete) return;
    
    setLoading(true);
    try {
      const employeeRef = doc(db, 'users', employeeToDelete.id);
      await deleteDoc(employeeRef);
      setShowDeleteModal(false);
      setEmployeeToDelete(null);
      Alert.alert('Success', 'Employee deleted successfully');
    } catch (error: any) {
      setModalError(error.message || 'Failed to delete employee');
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (employee: Employee) => {
    setEditEmployee(employee);
    setName(employee.name);
    setEmail(employee.email);
    setModalError(null);
    setEditModalVisible(true);
  };

  const updateEmployee = async () => {
    // Clear any previous errors
    setModalError(null);
    
    if (!editEmployee || !name || !email) {
      setModalError('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const employeeRef = doc(db, 'users', editEmployee.id);
      await updateDoc(employeeRef, {
        name,
        email,
        updatedAt: new Date().toISOString(),
      });

      setEditModalVisible(false);
      setEditEmployee(null);
      setName('');
      setEmail('');
      setModalError(null);
      Alert.alert('Success', 'Employee updated successfully');
    } catch (error: any) {
      let errorMessage = 'Unable to update employee';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'An account with this email already exists';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      }
      setModalError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter(
    (employee) =>
      employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const closeAddModal = () => {
    setModalVisible(false);
    setModalError(null);
    setName('');
    setEmail('');
    setPassword('');
  };

  const closeEditModal = () => {
    setEditModalVisible(false);
    setModalError(null);
    setEditEmployee(null);
    setName('');
    setEmail('');
  };

  if (role !== 'owner') {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <FontAwesome name="arrow-left" size={20} color="#333" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Staff Management</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <FontAwesome name="plus" size={20} color="white" />
          <Text style={styles.addButtonText}>Add Employee</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search employees..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      <ScrollView style={styles.employeeList}>
        {filteredEmployees.map((employee) => (
          <View key={employee.id} style={[styles.employeeCard, employee.status === 'inactive' && {borderLeftColor: '#E53E3E'}]}>
            <View style={styles.employeeInfo}>
              <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 6}}>
                <View style={{backgroundColor: '#EBF4FF', padding: 8, borderRadius: 20, marginRight: 10}}>
                  <FontAwesome name="user" size={18} color="#F36514" />
                </View>
                <Text style={styles.employeeName}>{employee.name}</Text>
              </View>
              <Text style={styles.employeeEmail}>
                <FontAwesome name="envelope-o" size={12} color="#718096" style={{marginRight: 6}} /> {employee.email}
              </Text>
              <Text style={[
                styles.statusBadge,
                employee.status === 'active' ? styles.activeBadge : styles.inactiveBadge
              ]}>
                {employee.status === 'active' ? '● Active' : '● Inactive'}
              </Text>
            </View>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionButton, styles.editButton]}
                onPress={() => openEditModal(employee)}
              >
                <FontAwesome name="pencil" size={20} color="#F36514" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => deleteEmployee(employee)}
              >
                <FontAwesome name="trash" size={20} color="#E53E3E" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeAddModal}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <FontAwesome name="user-plus" size={24} color="#F36514" style={{marginRight: 12}} />
                <Text style={styles.modalTitle}>Add New Employee</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeAddModal}
              >
                <FontAwesome name="times" size={20} color="#F36514" />
              </TouchableOpacity>
            </View>
            
            {modalError && (
              <View style={styles.errorContainer}>
                <FontAwesome name="exclamation-circle" size={16} color="#E53E3E" style={{marginRight: 8}} />
                <Text style={styles.errorText}>{modalError}</Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <FontAwesome name="user" size={16} color="#718096" />
                </View>
                <TextInput
                  style={styles.formInput}
                  placeholder="Enter employee's full name"
                  value={name}
                  onChangeText={setName}
                  placeholderTextColor="#A0AEC0"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <FontAwesome name="envelope-o" size={16} color="#718096" />
                </View>
                <TextInput
                  style={styles.formInput}
                  placeholder="Enter email address"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#A0AEC0"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <FontAwesome name="lock" size={16} color="#718096" />
                </View>
                <TextInput
                  style={styles.formInput}
                  placeholder="Create a password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholderTextColor="#A0AEC0"
                />
              </View>
              {password !== '' && password.length < 6 && (
                <Text style={[styles.inputHint, {color: '#E53E3E'}]}>Password must be at least 6 characters</Text>
              )}
              {password !== '' && password.length >= 6 && (
                <Text style={[styles.inputHint, {color: '#38A169'}]}>Password strength: Good</Text>
              )}
            </View>

            <View style={styles.formDividerSmall} />

            <View style={styles.formFooter}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={closeAddModal}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, loading && styles.disabledButton]}
                onPress={addEmployee}
                disabled={loading}
              >
                {loading ? (
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <FontAwesome name="circle-o-notch" size={16} color="white" style={{marginRight: 8}} />
                    <Text style={styles.submitButtonText}>Adding...</Text>
                  </View>
                ) : (
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <FontAwesome name="plus" size={16} color="white" style={{marginRight: 8}} />
                    <Text style={styles.submitButtonText}>Add Employee</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={closeEditModal}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <FontAwesome name="edit" size={24} color="#F36514" style={{marginRight: 12}} />
                <Text style={styles.modalTitle}>Edit Employee</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeEditModal}
              >
                <FontAwesome name="times" size={20} color="#F36514" />
              </TouchableOpacity>
            </View>
            
            {modalError && (
              <View style={styles.errorContainer}>
                <FontAwesome name="exclamation-circle" size={16} color="#E53E3E" style={{marginRight: 8}} />
                <Text style={styles.errorText}>{modalError}</Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <FontAwesome name="user" size={16} color="#718096" />
                </View>
                <TextInput
                  style={styles.formInput}
                  placeholder="Enter employee's full name"
                  value={name}
                  onChangeText={setName}
                  placeholderTextColor="#A0AEC0"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <FontAwesome name="envelope-o" size={16} color="#718096" />
                </View>
                <TextInput
                  style={styles.formInput}
                  placeholder="Enter email address"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#A0AEC0"
                />
              </View>
            </View>

            <View style={styles.formDividerSmall} />

            <View style={styles.formFooter}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={closeEditModal}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, loading && styles.disabledButton]}
                onPress={updateEmployee}
                disabled={loading}
              >
                {loading ? (
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <FontAwesome name="circle-o-notch" size={16} color="white" style={{marginRight: 8}} />
                    <Text style={styles.submitButtonText}>Updating...</Text>
                  </View>
                ) : (
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <FontAwesome name="check" size={16} color="white" style={{marginRight: 8}} />
                    <Text style={styles.submitButtonText}>Update Employee</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent={true}
        visible={showDeleteModal}
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, styles.deleteModalContent]}>
            <View style={styles.deleteModalIconContainer}>
              <FontAwesome name="exclamation-triangle" size={40} color="#E53E3E" />
            </View>
            
            <Text style={styles.deleteModalTitle}>Delete Employee</Text>
            
            <Text style={styles.deleteModalMessage}>
              Are you sure you want to delete {employeeToDelete?.name}?{'\n'}
              This action cannot be undone.
            </Text>
            
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity
                style={styles.deleteModalCancelButton}
                onPress={() => setShowDeleteModal(false)}
              >
                <Text style={styles.deleteModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.deleteModalConfirmButton}
                onPress={confirmDeleteEmployee}
                disabled={loading}
              >
                {loading ? (
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <FontAwesome name="circle-o-notch" size={16} color="white" style={{marginRight: 6}} />
                    <Text style={styles.deleteModalConfirmText}>Deleting...</Text>
                  </View>
                ) : (
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <FontAwesome name="trash" size={16} color="white" style={{marginRight: 6}} />
                    <Text style={styles.deleteModalConfirmText}>Delete</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000
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
    color: '#2D3748',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#718096',
    marginTop: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2D3748',
    letterSpacing: 0.5,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F36514',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  searchInput: {
    backgroundColor: 'white',
    padding: 14,
    borderRadius: 10,
    marginTop: 100,
    marginHorizontal: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  employeeList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  employeeCard: {
    backgroundColor: 'white',
    padding: 18,
    borderRadius: 12,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#F36514',
  },
  employeeInfo: {
    flex: 1,
    paddingRight: 10,
  },
  employeeName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 6,
  },
  employeeEmail: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  activeBadge: {
    backgroundColor: '#C6F6D5',
    color: '#2F855A',
  },
  inactiveBadge: {
    backgroundColor: '#FED7D7',
    color: '#C53030',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    padding: 8,
    borderRadius: 8,
  },
  actionButton: {
    padding: 10,
    marginLeft: 8,
    borderRadius: 8,
  },
  editButton: {
    marginRight: 8,
    backgroundColor: '#f7ebe1',
  },
  deleteButton: {
    backgroundColor: '#FFF5F5',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: Platform.OS === 'web' ? 0 : 16,
  },
  modalContent: {
    backgroundColor: 'white',
    padding: Platform.OS === 'web' ? 28 : 20,
    borderRadius: 16,
    width: Platform.OS === 'web' ? '70%' : '90%',
    maxWidth: Platform.OS === 'web' ? 420 : 380,
    maxHeight: Platform.OS === 'web' ? '90%' : '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Platform.OS === 'web' ? 28 : 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: Platform.OS === 'web' ? 16 : 12,
  },
  modalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: Platform.OS === 'web' ? 22 : 20,
    fontWeight: 'bold',
    color: '#2D3748',
    letterSpacing: 0.5,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F7FAFC',
  },
  formGroup: {
    marginBottom: Platform.OS === 'web' ? 20 : 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: Platform.OS === 'web' ? 8 : 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  inputIcon: {
    position: 'absolute',
    left: 14,
    zIndex: 1,
  },
  formInput: {
    backgroundColor: '#F7FAFC',
    padding: Platform.OS === 'web' ? 14 : 12,
    paddingLeft: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: Platform.OS === 'web' ? 15 : 14,
    flex: 1,
  },
  inputHint: {
    fontSize: 12,
    color: '#718096',
    marginTop: 4,
    marginLeft: 2,
  },
  formDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: Platform.OS === 'web' ? 20 : 16,
  },
  formDividerSmall: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: Platform.OS === 'web' ? 12 : 8,
  },
  formFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 0,
  },
  cancelButton: {
    padding: 12,
    borderRadius: 8,
    marginRight: 12,
  },
  cancelButtonText: {
    color: '#4A5568',
    fontSize: 16,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#F36514',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minWidth: 140,
    shadowColor: '#F36514',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  disabledButton: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FED7D7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#E53E3E',
  },
  errorText: {
    color: '#C53030',
    fontSize: 14,
    flex: 1,
  },
  deleteModalContent: {
    maxWidth: 350,
    padding: 24,
    alignItems: 'center',
  },
  deleteModalIconContainer: {
    marginBottom: 16,
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 12,
  },
  deleteModalMessage: {
    fontSize: 16,
    color: '#4A5568',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    gap: 12,
  },
  deleteModalCancelButton: {
    flex: 1,
    backgroundColor: '#EDF2F7',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteModalCancelText: {
    color: '#4A5568',
    fontWeight: '600',
    fontSize: 16,
  },
  deleteModalConfirmButton: {
    flex: 1,
    backgroundColor: '#E53E3E',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteModalConfirmText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});